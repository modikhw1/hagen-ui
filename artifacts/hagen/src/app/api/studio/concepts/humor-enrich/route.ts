/**
 * POST /api/studio/concepts/humor-enrich
 *
 * Async post-save enrichment endpoint.  LeTrend fires this as a background
 * (fire-and-forget) fetch immediately after a concept is saved, so the upload
 * flow stays fast while the v7.B refined humor fields arrive silently.
 *
 * Flow:
 *   1. Validate { videoUrl, gcsUri } — gcsUri is the Gemini File API URI
 *      returned by /api/studio/concepts/analyze.
 *   2. Re-download videoUrl and upload to GCS to get a gs:// URI that the
 *      Vertex AI tuned model can access.
 *   3. Call runTunedHumorModel(gsUri).
 *   4. Look up the analyzed_videos row by video_url and merge the refined
 *      fields into visual_analysis.script.humor.
 *
 * Response: { ok: true, fields: { handlingSummary, humorMechanism, whyItWorks } }
 * Errors return descriptive JSON without throwing (fire-and-forget safe).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { createVideoDownloader } from '@/lib/services/video/downloader'
import { createVideoStorageService } from '@/lib/services/video/storage'
import { runTunedHumorModel } from '@/lib/services/gemini/humor-model'

export const maxDuration = 60

const bodySchema = z.object({
  videoUrl: z.string().url('videoUrl must be a valid URL'),
  gcsUri: z.string().min(1, 'gcsUri must be a non-empty string'),
})

function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for humor-enrich writes')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  let localFilePath: string | undefined

  try {
    const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation_error', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { videoUrl } = parsed.data

    // ── Step 1: Resolve a gs:// URI for the tuned model ─────────────────────
    // If the caller already supplied a gs:// URI (from a previous GCS upload in
    // the analyze flow), use it directly and skip the costly re-download.
    // Otherwise fall back: download from videoUrl, upload to GCS, then proceed.
    let gsUri: string

    if (parsed.data.gcsUri.startsWith('gs://')) {
      gsUri = parsed.data.gcsUri
      console.log('[humor-enrich] Using provided gs:// URI directly:', gsUri)
    } else {
      const gcsConfigured = Boolean(
        process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GOOGLE_CLOUD_STORAGE_BUCKET,
      )
      if (!gcsConfigured) {
        console.warn('[humor-enrich] GCS not configured and no gs:// URI provided — skipping enrichment')
        return NextResponse.json(
          { error: 'gcs_not_configured', message: 'GOOGLE_CLOUD_PROJECT_ID or GOOGLE_CLOUD_STORAGE_BUCKET not set; supply a gs:// gcsUri to skip this requirement' },
          { status: 503 },
        )
      }

      console.log('[humor-enrich] Downloading video for tuned pass:', videoUrl)
      const downloader = createVideoDownloader()
      const rapidApiKey = process.env.RAPIDAPI_KEY?.trim()

      let dlResult: { success: boolean; filePath?: string; error?: string } = { success: false, error: 'no strategy' }

      if (rapidApiKey) {
        dlResult = await downloader.downloadWithScraper7(videoUrl, rapidApiKey)
        if (!dlResult.success) {
          console.warn('[humor-enrich] Scraper7 failed:', dlResult.error)
          dlResult = await downloader.downloadWithYtDlp(videoUrl)
        }
      } else {
        dlResult = await downloader.downloadWithYtDlp(videoUrl)
      }

      if (!dlResult.success || !dlResult.filePath) {
        console.error('[humor-enrich] Download failed:', dlResult.error)
        return NextResponse.json(
          { error: 'download_failed', message: dlResult.error ?? 'All download strategies exhausted' },
          { status: 422 },
        )
      }
      localFilePath = dlResult.filePath
      console.log('[humor-enrich] Downloaded to:', localFilePath)

      const storage = createVideoStorageService()
      const destPath = `studio/humor-enrich/${Date.now()}${path.extname(localFilePath)}`
      console.log('[humor-enrich] Uploading to GCS:', destPath)
      const gcsResult = await storage.uploadVideo(localFilePath, destPath)

      if (!gcsResult.success || !gcsResult.gsUrl) {
        console.error('[humor-enrich] GCS upload failed:', gcsResult.error)
        return NextResponse.json(
          { error: 'gcs_upload_failed', message: gcsResult.error ?? 'GCS upload failed' },
          { status: 502 },
        )
      }
      gsUri = gcsResult.gsUrl
      console.log('[humor-enrich] GCS URI:', gsUri)

      await downloader.cleanup(localFilePath).catch(() => {})
      localFilePath = undefined
    }

    // ── Step 3: Run tuned humor model ─────────────────────────────────────────
    console.log('[humor-enrich] Running v7.B tuned model…')
    const tuned = await runTunedHumorModel(gsUri)
    if (!tuned) {
      console.warn('[humor-enrich] Tuned model returned no result — aborting enrichment')
      return NextResponse.json(
        { error: 'tuned_model_failed', message: 'v7.B model returned no result' },
        { status: 502 },
      )
    }
    console.log('[humor-enrich] Tuned model complete, version:', tuned.versionUsed)

    // ── Step 4: Patch analyzed_videos in Supabase ─────────────────────────────
    const supabase = makeSupabase()

    const { data: videoRow, error: selectError } = await supabase
      .from('analyzed_videos')
      .select('id, visual_analysis')
      .eq('video_url', videoUrl)
      .maybeSingle()

    if (selectError) {
      console.error('[humor-enrich] Supabase select failed:', selectError.message)
      return NextResponse.json(
        { error: 'db_select_failed', message: selectError.message },
        { status: 500 },
      )
    }

    if (!videoRow) {
      console.warn('[humor-enrich] No analyzed_videos row found for video_url:', videoUrl)
      return NextResponse.json(
        { error: 'row_not_found', message: 'No analyzed_videos row found for this videoUrl' },
        { status: 404 },
      )
    }

    // JS-side merge: patch humor sub-object inside visual_analysis.script.humor
    const currentAnalysis = (videoRow.visual_analysis ?? {}) as Record<string, unknown>
    const currentScript = (currentAnalysis['script'] ?? {}) as Record<string, unknown>
    const currentHumor = (currentScript['humor'] ?? {}) as Record<string, unknown>

    const patchedHumor = {
      ...currentHumor,
      ...(tuned.handlingSummary ? { handlingSummary: tuned.handlingSummary } : {}),
      ...(tuned.mechanism ? { humorMechanism: tuned.mechanism } : {}),
      ...(tuned.whyItWorks ? { whyItWorks: tuned.whyItWorks } : {}),
      tunedRawText: tuned.rawText,
    }

    const patchedScript = { ...currentScript, humor: patchedHumor }
    const patchedAnalysis = {
      ...currentAnalysis,
      script: patchedScript,
      analysisModel: `gemini-2.0-flash-001+${tuned.versionUsed}`,
    }

    const { error: updateError } = await supabase
      .from('analyzed_videos')
      .update({ visual_analysis: patchedAnalysis })
      .eq('id', videoRow.id)

    if (updateError) {
      console.error('[humor-enrich] Supabase update failed:', updateError.message)
      return NextResponse.json(
        { error: 'db_update_failed', message: updateError.message },
        { status: 500 },
      )
    }

    console.log('[humor-enrich] analyzed_videos patched for row:', videoRow.id)

    // Also patch concepts.backend_data.script.humor so the concept review page
    // can surface the tuned fields via the translator (which prefers script.humor.*).
    // Uses a Postgres jsonb path update via RPC or raw SQL through the REST filter approach.
    // We do a JS-side merge: fetch the concept row, patch, then update.
    // Fetch concepts by video URL using two separate queries (one per JSON field) to
    // avoid raw URL interpolation in .or() filter strings, which can break on URLs
    // containing commas or special characters.
    const [byUrl, bySourceUrl] = await Promise.all([
      supabase.from('concepts').select('id, backend_data').filter('backend_data->>url', 'eq', videoUrl).limit(5),
      supabase.from('concepts').select('id, backend_data').filter('backend_data->>source_url', 'eq', videoUrl).limit(5),
    ])
    const conceptSelectError = byUrl.error ?? bySourceUrl.error
    const seenIds = new Set<string>()
    const conceptRows = [...(byUrl.data ?? []), ...(bySourceUrl.data ?? [])].filter((row) => {
      if (seenIds.has(row.id as string)) return false
      seenIds.add(row.id as string)
      return true
    })

    if (!conceptSelectError && conceptRows && conceptRows.length > 0) {
      for (const conceptRow of conceptRows) {
        const bd = (conceptRow.backend_data ?? {}) as Record<string, unknown>
        const bdScript = (bd['script'] ?? {}) as Record<string, unknown>
        const bdHumor = (bdScript['humor'] ?? {}) as Record<string, unknown>

        const patchedBdHumor = {
          ...bdHumor,
          ...(tuned.handlingSummary ? { handlingSummary: tuned.handlingSummary } : {}),
          ...(tuned.mechanism ? { humorMechanism: tuned.mechanism } : {}),
          ...(tuned.whyItWorks ? { whyItWorks: tuned.whyItWorks } : {}),
          tunedRawText: tuned.rawText,
        }
        const patchedBd = {
          ...bd,
          script: { ...bdScript, humor: patchedBdHumor },
          analysisModel: `gemini-2.0-flash-001+${tuned.versionUsed}`,
        }

        const { error: conceptUpdateError } = await supabase
          .from('concepts')
          .update({ backend_data: patchedBd })
          .eq('id', conceptRow.id)

        if (conceptUpdateError) {
          console.warn('[humor-enrich] concepts backend_data update failed for', conceptRow.id, ':', conceptUpdateError.message)
        } else {
          console.log('[humor-enrich] concepts backend_data patched for:', conceptRow.id)
        }
      }
    } else if (conceptSelectError) {
      console.warn('[humor-enrich] concepts select failed (non-fatal):', conceptSelectError.message)
    } else {
      console.log('[humor-enrich] No concepts row found for videoUrl (non-fatal):', videoUrl)
    }

    return NextResponse.json({
      ok: true,
      fields: {
        handlingSummary: tuned.handlingSummary,
        humorMechanism: tuned.mechanism,
        whyItWorks: tuned.whyItWorks,
      },
    })
  } catch (err) {
    console.error('[humor-enrich] Unexpected error:', err)
    if (localFilePath) {
      const downloader = createVideoDownloader()
      await downloader.cleanup(localFilePath).catch(() => {})
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'enrich_failed', message }, { status: 500 })
  }
}
