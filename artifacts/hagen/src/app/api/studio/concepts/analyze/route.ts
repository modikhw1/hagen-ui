/**
 * POST /api/studio/concepts/analyze
 *
 * Studio ingest step 1 — given a public video URL, download the video,
 * upload it to the Gemini File API, and run the comprehensive video
 * analysis pipeline. Returns the raw analysis object so the caller
 * (api-server → letrend UploadConceptModal) can pass it to the enrich
 * step without storing anything in Supabase.
 *
 * Response shape:
 *   { analysis: VideoAnalysis, upload: { gcsUri: string } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createVideoDownloader } from '@/lib/services/video/downloader'
import { createVideoStorageService } from '@/lib/services/video/storage'
import { GeminiVideoAnalyzer } from '@/lib/services/video/gemini'

const bodySchema = z.object({
  videoUrl: z.string().url('videoUrl must be a valid URL'),
  platform: z.string().optional(),
})

export const maxDuration = 60

export async function POST(request: NextRequest) {
  let localFilePath: string | undefined

  try {
    const rawBody = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation-error', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { videoUrl } = parsed.data

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'gemini-not-configured', message: 'GEMINI_API_KEY is not set' },
        { status: 503 },
      )
    }

    // ── Step 1: Download ────────────────────────────────────────────────────
    console.log(`[studio/analyze] Downloading: ${videoUrl}`)
    const downloader = createVideoDownloader()
    const rapidApiKey = process.env.RAPIDAPI_KEY?.trim()

    let downloadResult = rapidApiKey
      ? await downloader.downloadWithScraper7(videoUrl, rapidApiKey)
      : { success: false as const, error: 'RAPIDAPI_KEY not set' }

    if (!downloadResult.success) {
      console.log('[studio/analyze] Scraper7 failed, trying yt-dlp:', downloadResult.error)
      downloadResult = await downloader.downloadWithYtDlp(videoUrl)
    }

    if (!downloadResult.success || !downloadResult.filePath) {
      return NextResponse.json(
        {
          error: 'download-failed',
          message: `Could not download video: ${downloadResult.error ?? 'unknown error'}`,
        },
        { status: 422 },
      )
    }
    localFilePath = downloadResult.filePath
    console.log(`[studio/analyze] Downloaded to ${localFilePath}`)

    // ── Step 2: Upload to Gemini File API ───────────────────────────────────
    console.log('[studio/analyze] Uploading to Gemini File API…')
    const storage = createVideoStorageService()
    const uploadResult = await storage.uploadToGeminiFileAPI(localFilePath)

    if (!uploadResult.success || !uploadResult.gsUrl) {
      return NextResponse.json(
        {
          error: 'upload-failed',
          message: `Gemini File API upload failed: ${uploadResult.error ?? 'unknown error'}`,
        },
        { status: 502 },
      )
    }
    const gcsUri = uploadResult.gsUrl
    console.log(`[studio/analyze] Uploaded to Gemini: ${gcsUri}`)

    // ── Step 3: Analyze ─────────────────────────────────────────────────────
    console.log('[studio/analyze] Running Gemini analysis…')
    const analyzer = new GeminiVideoAnalyzer()
    const analysis = await analyzer.analyzeVideo(gcsUri, {
      detailLevel: 'comprehensive',
      useLearning: false,
    })
    console.log('[studio/analyze] Analysis complete')

    // ── Step 4: Cleanup ─────────────────────────────────────────────────────
    await downloader.cleanup(localFilePath).catch(() => {})
    localFilePath = undefined

    return NextResponse.json({ analysis, upload: { gcsUri } })
  } catch (err) {
    console.error('[studio/analyze] Error:', err)

    // Best-effort cleanup even on error
    if (localFilePath) {
      const downloader = createVideoDownloader()
      await downloader.cleanup(localFilePath).catch(() => {})
    }

    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: 'analyze-failed', message },
      { status: 500 },
    )
  }
}
