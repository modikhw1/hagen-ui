/**
 * POST /api/studio/concepts/analyze
 *
 * Studio ingest step 1 — download → Gemini File API upload → comprehensive
 * video analysis → optional v7.B fine-tuned humor pass (when clip is humorous
 * AND GCS is configured).
 *
 * The fine-tuning version is resolved from datasets/fine-tuning/model_versions.json
 * using the same getModelResource() logic as /api/fine-tuning/generate, with
 * 'v7.B' pinned as the humor-analysis version so behavior is predictable.
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
 *   422  gcs_upload_failed   (GCS upload to prepare fine-tuning pass)
 *   502  upload_failed       (Gemini File API upload)
 *   503  gemini_not_configured
 *   500  analyze_failed
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { createVideoDownloader } from '@/lib/services/video/downloader'
import { createVideoStorageService } from '@/lib/services/video/storage'
import { GeminiVideoAnalyzer } from '@/lib/services/video/gemini'
import type { VideoAnalysis } from '@/lib/services/types'

const bodySchema = z.object({
  videoUrl: z.string().url('videoUrl must be a valid URL'),
  platform: z.string().optional(),
})

export const maxDuration = 60

// ── Model version resolution (mirrors fine-tuning/generate/route.ts) ───────

const DATASET_DIR = path.join(process.cwd(), 'datasets/fine-tuning')
const MODEL_VERSIONS_FILE = path.join(DATASET_DIR, 'model_versions.json')
const TUNED_MODEL_FILE = path.join(DATASET_DIR, 'tuned_model.json')

/** Pinned fine-tuning version used for the humor sharpening pass. */
const HUMOR_TUNING_VERSION = 'v7.B'

function getModelResource(version: string): { resourceName: string; versionUsed: string } | null {
  try {
    if (fs.existsSync(MODEL_VERSIONS_FILE)) {
      const versions = JSON.parse(fs.readFileSync(MODEL_VERSIONS_FILE, 'utf-8')) as {
        versions?: Record<string, { endpoint?: string; model?: string }>
        default?: string
        latest?: string
      }
      const targetVersion = version || versions.default || versions.latest
      const modelInfo = targetVersion ? versions.versions?.[targetVersion] : undefined
      if (modelInfo?.endpoint || modelInfo?.model) {
        return {
          resourceName: (modelInfo.endpoint ?? modelInfo.model) as string,
          versionUsed: targetVersion as string,
        }
      }
    }
    // Fallback: legacy single-model file
    if (fs.existsSync(TUNED_MODEL_FILE)) {
      const modelInfo = JSON.parse(fs.readFileSync(TUNED_MODEL_FILE, 'utf-8')) as {
        endpoint?: string
        model?: string
      }
      return {
        resourceName: (modelInfo.endpoint ?? modelInfo.model) as string,
        versionUsed: 'legacy',
      }
    }
  } catch (err) {
    console.warn('[studio/analyze] Could not read model_versions.json:', err instanceof Error ? err.message : String(err))
  }
  return null
}

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

// ── Fine-tuning (v7.B) — structured humor sharpener ────────────────────────

interface TunedHumorResult {
  /** Parsed "Handling" field — a one-sentence description of what happens */
  handlingSummary: string
  /** Parsed "Mekanism" field — comma-separated mechanism keywords */
  mechanism: string
  /** Parsed "Varför" field — why it works */
  whyItWorks: string
  /** Raw full response text for auditing */
  rawText: string
  versionUsed: string
}

/**
 * Parse the concise v7.B response format into structured fields:
 *   **Handling:** <one sentence>
 *   **Mekanism:** <keywords>
 *   **Varför:** <one sentence>
 */
function parseTunedResponse(text: string): Omit<TunedHumorResult, 'rawText' | 'versionUsed'> {
  const extract = (label: string): string => {
    const re = new RegExp(`\\*{0,2}${label}:\\*{0,2}\\s*(.+?)(?=\\n\\*{0,2}[A-ZÅÄÖ]|$)`, 'si')
    const m = text.match(re)
    return m ? m[1].trim().replace(/\*+/g, '').trim() : ''
  }
  return {
    handlingSummary: extract('Handling'),
    mechanism: extract('Mekanism'),
    whyItWorks: extract('Varför'),
  }
}

async function runTunedHumorModel(gcsUri: string): Promise<TunedHumorResult | null> {
  const modelRes = getModelResource(HUMOR_TUNING_VERSION)
  if (!modelRes) {
    console.warn('[studio/analyze] v7.B model resource not found in model_versions.json — skipping')
    return null
  }

  try {
    // google-auth-library is installed but its types are missing in this workspace.
    // Dynamic require avoids compile-time TS block; behavior is identical at runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GoogleAuth } = require('google-auth-library') as {
      GoogleAuth: new (opts: { scopes: string[] }) => {
        getClient(): Promise<{
          getAccessToken(): Promise<{ token: string | null | undefined }>
        }>
      }
    }
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
    const client = await auth.getClient()
    const { token } = await client.getAccessToken()
    if (!token) {
      console.warn('[studio/analyze] v7.B: could not obtain access token')
      return null
    }

    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/${modelRes.resourceName}:generateContent`

    // Concise structured prompt — matches the PROMPT_CONCISE in fine-tuning/generate/route.ts
    const prompt = `Analysera videon kort och koncist.

Format:
**Handling:** [En mening om vad som sker]
**Mekanism:** [Nyckelord: t.ex. Subversion, Igenkänning]
**Varför:** [En mening om poängen]

Håll det extremt kort. Inget fluff.`

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { mimeType: 'video/mp4', fileUri: gcsUri } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!resp.ok) {
      console.warn(`[studio/analyze] v7.B (${modelRes.versionUsed}) call failed:`, resp.status)
      return null
    }

    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null

    const parsed = parseTunedResponse(text)
    return { ...parsed, rawText: text.trim(), versionUsed: modelRes.versionUsed }
  } catch (err) {
    console.warn(
      '[studio/analyze] v7.B optional call failed:',
      err instanceof Error ? err.message : String(err),
    )
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
      const destPath = `studio/analyze/${Date.now()}${path.extname(localFilePath)}`
      const gcsResult = await storage.uploadVideo(localFilePath, destPath)

      if (!gcsResult.success || !gcsResult.gsUrl) {
        // Return immediately with a typed error — caller can retry or skip the fine-tuning pass
        console.error('[studio/analyze] GCS upload failed:', gcsResult.error)
        return NextResponse.json(
          {
            error: 'gcs_upload_failed',
            message: `GCS upload for fine-tuning pass failed: ${gcsResult.error ?? 'unknown error'}`,
            // Still surface the base analysis so partial results are not lost
            analysis,
            upload: { gcsUri: geminiUri },
          },
          { status: 422 },
        )
      }

      gcsUri = gcsResult.gsUrl
      console.log(`[studio/analyze] GCS URI: ${gcsUri}`)

      const tuned = await runTunedHumorModel(gcsUri)
      if (tuned && scriptHumor) {
        // Merge parsed structured fields — never inject raw multi-line text
        if (tuned.handlingSummary) scriptHumor['handlingSummary'] = tuned.handlingSummary
        if (tuned.mechanism) scriptHumor['humorMechanism'] = tuned.mechanism
        if (tuned.whyItWorks) scriptHumor['whyItWorks'] = tuned.whyItWorks
        scriptHumor['tunedRawText'] = tuned.rawText
        analysis.analysisModel = `gemini-2.0-flash-001+${tuned.versionUsed}`
        console.log(`[studio/analyze] v7.B fields merged, model=${analysis.analysisModel}`)
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
