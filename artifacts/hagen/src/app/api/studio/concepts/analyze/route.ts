/**
 * POST /api/studio/concepts/analyze
 *
 * Studio ingest step 1 — download, upload to Gemini File API, run comprehensive
 * video analysis, and (if the clip is humorous and Vertex AI is configured) run
 * the v7.B fine-tuned humor-analysis model to sharpen the humor fields.
 *
 * Response shape:
 *   {
 *     analysis:  VideoAnalysis & { analysisModel: string },
 *     upload:    { gcsUri: string }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createVideoDownloader } from '@/lib/services/video/downloader'
import { createVideoStorageService } from '@/lib/services/video/storage'
import { GeminiVideoAnalyzer } from '@/lib/services/video/gemini'
import type { VideoAnalysis } from '@/lib/services/types'
import path from 'path'

const bodySchema = z.object({
  videoUrl: z.string().url('videoUrl must be a valid URL'),
  platform: z.string().optional(),
})

export const maxDuration = 60

// ── Downloader with chain-of-fallback ──────────────────────────────────────

interface DownloadSuccess {
  ok: true
  filePath: string
}
interface DownloadFailure {
  ok: false
  error: string
}
type DownloadOutcome = DownloadSuccess | DownloadFailure

async function downloadVideo(videoUrl: string): Promise<DownloadOutcome> {
  const downloader = createVideoDownloader()
  const rapidApiKey = process.env.RAPIDAPI_KEY?.trim()

  // 1. Scraper7 (primary — reliable for TikTok)
  if (rapidApiKey) {
    const r = await downloader.downloadWithScraper7(videoUrl, rapidApiKey)
    if (r.success && r.filePath) {
      return { ok: true, filePath: r.filePath }
    }
    console.warn('[studio/analyze] Scraper7 failed:', r.error)
  }

  // 2. yt-dlp (secondary)
  const ytdlp = await downloader.downloadWithYtDlp(videoUrl)
  if (ytdlp.success && ytdlp.filePath) {
    return { ok: true, filePath: ytdlp.filePath }
  }
  console.warn('[studio/analyze] yt-dlp failed:', ytdlp.error)

  return {
    ok: false,
    error: `download_failed: all strategies exhausted — ${ytdlp.error ?? 'unknown'}`,
  }
}

// ── Fine-tuning (v7.B) — optional humor sharpener ─────────────────────────

const V7B_ENDPOINT =
  'projects/1061681256498/locations/us-central1/endpoints/6056865410278490112'

interface TunedHumorResult {
  humorMechanism: string
  modelVersion: string
}

async function runTunedHumorModel(gcsUri: string): Promise<TunedHumorResult | null> {
  try {
    // google-auth-library types may be missing in this workspace but the
    // package is installed — dynamic import to avoid compile-time TS block.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GoogleAuth } = require('google-auth-library') as {
      GoogleAuth: new (opts: { scopes: string[] }) => {
        getClient(): Promise<{ getAccessToken(): Promise<{ token: string | null | undefined }> }>
      }
    }
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
    const client = await auth.getClient()
    const { token } = await client.getAccessToken()
    if (!token) return null

    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/${V7B_ENDPOINT}:generateContent`

    const prompt = `Analysera denna video kort och koncist.

Format:
**Handling:** [En mening om vad som sker]
**Mekanism:** [Nyckelord: t.ex. Subversion, Igenkänning]
**Varför:** [En mening om poängen]

Håll det extremt kort.`

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ fileData: { mimeType: 'video/mp4', fileUri: gcsUri } }, { text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!resp.ok) {
      console.warn('[studio/analyze] v7.B call failed:', resp.status)
      return null
    }

    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null

    return { humorMechanism: text.trim(), modelVersion: 'v7.B' }
  } catch (err) {
    console.warn('[studio/analyze] v7.B optional call failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

// ── Route handler ──────────────────────────────────────────────────────────

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

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'gemini_not_configured', message: 'GEMINI_API_KEY is not set' },
        { status: 503 },
      )
    }

    // ── Step 1: Download ─────────────────────────────────────────────────────
    console.log(`[studio/analyze] Downloading: ${videoUrl}`)
    const dlResult = await downloadVideo(videoUrl)
    if (!dlResult.ok) {
      return NextResponse.json(
        { error: 'download_failed', message: dlResult.error },
        { status: 422 },
      )
    }
    localFilePath = dlResult.filePath
    console.log(`[studio/analyze] Downloaded to ${localFilePath}`)

    // ── Step 2: Upload to Gemini File API ────────────────────────────────────
    console.log('[studio/analyze] Uploading to Gemini File API…')
    const storage = createVideoStorageService()
    const geminiUpload = await storage.uploadToGeminiFileAPI(localFilePath)
    if (!geminiUpload.success || !geminiUpload.gsUrl) {
      return NextResponse.json(
        {
          error: 'upload_failed',
          message: `Gemini File API upload failed: ${geminiUpload.error ?? 'unknown error'}`,
        },
        { status: 502 },
      )
    }
    const geminiUri = geminiUpload.gsUrl
    console.log(`[studio/analyze] Uploaded to Gemini: ${geminiUri}`)

    // ── Step 3: Base Gemini analysis ─────────────────────────────────────────
    console.log('[studio/analyze] Running Gemini analysis…')
    const analyzer = new GeminiVideoAnalyzer()
    const analysis: VideoAnalysis & { analysisModel?: string } = await analyzer.analyzeVideo(
      geminiUri,
      { detailLevel: 'comprehensive', useLearning: false },
    )
    analysis.analysisModel = 'gemini-2.0-flash-001'
    // script.humor is typed as [key: string]: unknown — use keyed access
    const scriptHumor = analysis.script?.['humor'] as Record<string, unknown> | undefined
    console.log('[studio/analyze] Base analysis complete, isHumorous:', scriptHumor?.['isHumorous'])

    // ── Step 4: Optional — fine-tuned humor pass (v7.B) ──────────────────────
    const isHumorous = scriptHumor?.['isHumorous'] === true
    const gcsConfigured = Boolean(
      process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GOOGLE_CLOUD_STORAGE_BUCKET,
    )

    let gcsUri: string | undefined

    if (isHumorous && gcsConfigured) {
      console.log('[studio/analyze] Video is humorous — uploading to GCS for v7.B pass…')
      const ext = path.extname(localFilePath)
      const destPath = `studio/analyze/${Date.now()}${ext}`
      const gcsResult = await storage.uploadVideo(localFilePath, destPath).catch((err: unknown) => {
        console.warn('[studio/analyze] GCS upload failed:', err instanceof Error ? err.message : String(err))
        return { success: false as const, error: String(err) }
      })

      if (gcsResult.success && gcsResult.gsUrl) {
        gcsUri = gcsResult.gsUrl
        console.log(`[studio/analyze] GCS URI: ${gcsUri}`)
        const tuned = await runTunedHumorModel(gcsUri)
        if (tuned && scriptHumor) {
          scriptHumor['humorMechanism'] = tuned.humorMechanism
          analysis.analysisModel = `gemini-2.0-flash-001+${tuned.modelVersion}`
          console.log(`[studio/analyze] v7.B pass merged, model=${analysis.analysisModel}`)
        }
      }
    }

    // ── Step 5: Cleanup ──────────────────────────────────────────────────────
    const downloader = createVideoDownloader()
    await downloader.cleanup(localFilePath).catch(() => {})
    localFilePath = undefined

    return NextResponse.json({
      analysis,
      upload: { gcsUri: gcsUri ?? geminiUri },
    })
  } catch (err) {
    console.error('[studio/analyze] Error:', err)
    if (localFilePath) {
      const downloader = createVideoDownloader()
      await downloader.cleanup(localFilePath).catch(() => {})
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'analyze_failed', message }, { status: 500 })
  }
}
