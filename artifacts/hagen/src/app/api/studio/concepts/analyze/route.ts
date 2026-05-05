/**
 * POST /api/studio/concepts/analyze
 *
 * Studio ingest step 1 — download → Gemini File API upload → comprehensive
 * video analysis (base Gemini only).
 *
 * The v7.B fine-tuned humor pass has been moved to
 * POST /api/studio/concepts/humor-enrich, which LeTrend fires as a
 * fire-and-forget background request after the concept is saved.
 *
 * Response shape:
 *   {
 *     analysis:  VideoAnalysis & { analysisModel: string },
 *     upload:    { gcsUri: string }
 *   }
 *
 * Error codes (always in JSON body as { error: string, message?: string }):
 *   400  validation_error
 *   422  download_failed
 *   502  upload_failed       (Gemini File API upload)
 *   503  gemini_not_configured
 *   500  analyze_failed
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createVideoDownloader } from '@/lib/services/video/downloader'
import { createVideoStorageService } from '@/lib/services/video/storage'
import { GeminiVideoAnalyzer } from '@/lib/services/video/gemini'
import type { VideoAnalysis } from '@/lib/services/types'
import { getCachedGeminiUri, setCachedGeminiUri, evictExpiredEntries } from '@/lib/services/video/gemini-uri-cache'

const bodySchema = z.object({
  videoUrl: z.string().url('videoUrl must be a valid URL'),
  platform: z.string().optional(),
})

export const maxDuration = 60

// ── Downloader with chain-of-fallback ──────────────────────────────────────

interface DownloadSuccess { ok: true; filePath: string }
interface DownloadFailure { ok: false; error: string }
type DownloadOutcome = DownloadSuccess | DownloadFailure

async function downloadVideo(videoUrl: string): Promise<DownloadOutcome> {
  const downloader = createVideoDownloader()
  const rapidApiKey = process.env.RAPIDAPI_KEY?.trim()

  // 1. Scraper7 (primary — reliable for TikTok)
  if (rapidApiKey) {
    const r = await downloader.downloadWithScraper7(videoUrl, rapidApiKey)
    if (r.success && r.filePath) return { ok: true, filePath: r.filePath }
    console.warn('[studio/analyze] Scraper7 failed:', r.error)
  }

  // 2. yt-dlp (secondary)
  const ytdlp = await downloader.downloadWithYtDlp(videoUrl)
  if (ytdlp.success && ytdlp.filePath) return { ok: true, filePath: ytdlp.filePath }
  console.warn('[studio/analyze] yt-dlp failed:', ytdlp.error)

  return {
    ok: false,
    error: `download_failed: all strategies exhausted — ${ytdlp.error ?? 'unknown'}`,
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

    // Opportunistically evict stale cache entries on each request (cheap O(n) scan).
    evictExpiredEntries()

    // ── Step 1: Download (skipped on cache hit) ───────────────────────────────
    const cachedUri = getCachedGeminiUri(videoUrl)
    let geminiUri: string

    const storage = createVideoStorageService()

    if (cachedUri) {
      console.log(`[studio/analyze] Cache hit — reusing Gemini URI for: ${videoUrl}`)
      geminiUri = cachedUri
    } else {
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

      // ── Step 2: Upload to Gemini File API ──────────────────────────────────
      console.log('[studio/analyze] Uploading to Gemini File API…')
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
      geminiUri = geminiUpload.gsUrl
      console.log(`[studio/analyze] Uploaded to Gemini: ${geminiUri}`)

      // Store in cache so subsequent requests for the same URL skip download+upload.
      setCachedGeminiUri(videoUrl, geminiUri)
    }

    // ── Step 3: Base Gemini analysis ─────────────────────────────────────────
    console.log('[studio/analyze] Running Gemini analysis…')
    const analyzer = new GeminiVideoAnalyzer()
    const analysis: VideoAnalysis & { analysisModel?: string } = await analyzer.analyzeVideo(
      geminiUri,
      { detailLevel: 'comprehensive', useLearning: false },
    )
    analysis.analysisModel = 'gemini-2.0-flash-001'

    const scriptHumor = analysis.script?.['humor'] as Record<string, unknown> | undefined
    console.log('[studio/analyze] Base analysis complete, isHumorous:', scriptHumor?.['isHumorous'])

    // ── Step 4: Cleanup ──────────────────────────────────────────────────────
    if (localFilePath) {
      const downloader = createVideoDownloader()
      await downloader.cleanup(localFilePath).catch(() => {})
      localFilePath = undefined
    }

    // The v7.B humor enrichment pass is fired as a background request from
    // LeTrend after the concept is saved. See POST /api/studio/concepts/humor-enrich.
    return NextResponse.json({
      analysis,
      upload: { gcsUri: geminiUri },
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
