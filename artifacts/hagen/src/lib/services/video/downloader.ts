/**
 * Video Download Service
 *
 * Downloads videos from TikTok, YouTube, etc. for deep analysis.
 * Requires external tools since direct TikTok downloading is complex.
 */

import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'

function spawnAsync(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { shell: true })
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(new Error(`Exit code ${code}: ${stderr || stdout}`))
    })

    proc.on('error', reject)
  })
}

function truncateOutput(value: string, maxLength: number = 1200): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed
}

export interface DownloadOptions {
  outputDir?: string
  maxFileSize?: number
  quality?: 'high' | 'medium' | 'low'
}

export interface DownloadResult {
  success: boolean
  filePath?: string
  fileSize?: number
  duration?: number
  error?: string
}

export class VideoDownloader {
  private outputDir: string
  private maxFileSize: number

  constructor(options: DownloadOptions = {}) {
    this.outputDir = options.outputDir || process.env.VIDEO_STORAGE_PATH || '/tmp/hagen-videos'
    this.maxFileSize = (options.maxFileSize || 100) * 1024 * 1024
  }

  async download(url: string, options?: { outputDir?: string }): Promise<DownloadResult> {
    if (options?.outputDir) {
      this.outputDir = options.outputDir
    }

    return this.downloadWithYtDlp(url)
  }

  /**
   * Download video using yt-dlp with up to 2 retries (exponential backoff: 2s/4s).
   * Transient network errors and TikTok 429s resolve reliably on a second attempt.
   *
   * Installation required:
   *   Ubuntu/Debian: sudo apt install python3 yt-dlp ffmpeg
   *   Mac: brew install yt-dlp
   *   Railway/Nixpacks: install python3, yt-dlp, ffmpeg via Nix packages
   */
  async downloadWithYtDlp(url: string, maxAttempts = 3): Promise<DownloadResult> {
    const ytDlpCommand = process.platform === 'win32'
      ? `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python314\\python.exe`
      : 'yt-dlp'

    await fs.mkdir(this.outputDir, { recursive: true })

    let lastError = 'Unknown error'

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        const delayMs = 2000 * Math.pow(2, attempt - 2)
        console.log(`[video-downloader] yt-dlp retry ${attempt}/${maxAttempts} (backoff ${delayMs}ms)…`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }

      const filename = `video_${Date.now()}_a${attempt}.mp4`
      const outputPath = path.join(this.outputDir, filename)

      try {
        console.log(`[video-downloader] yt-dlp attempt ${attempt}/${maxAttempts}: ${url}`)

        const args = process.platform === 'win32'
          ? [
              '-m', 'yt_dlp',
              '--no-cache-dir', '--no-playlist',
              '--format', 'best[ext=mp4]/best',
              '--max-filesize', `${this.maxFileSize}`,
              '--output', outputPath,
              '--no-warnings',
              url,
            ]
          : [
              '--no-cache-dir', '--no-playlist',
              '--format', 'best[ext=mp4]/best',
              '--max-filesize', `${this.maxFileSize}`,
              '--output', outputPath,
              '--no-warnings',
              url,
            ]

        const { stdout, stderr } = await spawnAsync(ytDlpCommand, args)

        if (stdout.trim()) console.log('[video-downloader] yt-dlp stdout:', truncateOutput(stdout))
        if (stderr.trim()) console.warn('[video-downloader] yt-dlp stderr:', truncateOutput(stderr))

        const stats = await fs.stat(outputPath).catch(() => null)
        if (!stats) throw new Error('Download completed but file not found at expected path')

        console.log(`[video-downloader] Downloaded (attempt ${attempt}): ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`)
        return { success: true, filePath: outputPath, fileSize: stats.size }

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        console.warn(`[video-downloader] yt-dlp attempt ${attempt}/${maxAttempts} failed: ${truncateOutput(lastError)}`)
        // Clean up partial output file from failed attempt
        await fs.unlink(outputPath).catch(() => {})
      }
    }

    const diagnostic = [
      `download_failed`,
      `platform=${process.platform}`,
      `command=${ytDlpCommand}`,
      `outputDir=${this.outputDir}`,
      'hint=ensure python3,yt-dlp,ffmpeg are installed in runtime',
      `cause=${truncateOutput(lastError)}`,
    ].join(' | ')

    console.error('[video-downloader] All yt-dlp attempts failed:', diagnostic)
    return { success: false, error: diagnostic }
  }

  /**
   * Download via Scraper7 RapidAPI with up to 2 retries.
   * Scraper7 is the primary path for TikTok; retries handle transient 5xx and
   * CDN redirect failures on the play URL fetch.
   */
  async downloadWithScraper7(tiktokUrl: string, apiKey: string, maxAttempts = 2): Promise<DownloadResult> {
    let lastError = 'Unknown error'

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        const delayMs = 1500
        console.log(`[video-downloader] Scraper7 retry ${attempt}/${maxAttempts} (backoff ${delayMs}ms)…`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }

      try {
        const infoUrl = new URL('https://tiktok-scraper7.p.rapidapi.com/video/info')
        infoUrl.searchParams.set('url', tiktokUrl)

        console.log(`[video-downloader] Scraper7 attempt ${attempt}/${maxAttempts}: ${tiktokUrl}`)

        const infoRes = await fetch(infoUrl.toString(), {
          headers: {
            'x-rapidapi-key': apiKey,
            'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com',
          },
          signal: AbortSignal.timeout(15000),
        })

        if (!infoRes.ok) {
          throw new Error(`download_failed: Scraper7 /video/info HTTP ${infoRes.status}`)
        }

        const info = await infoRes.json() as Record<string, unknown>
        const playUrl: string | undefined =
          (info?.['data'] as Record<string, unknown> | undefined)?.['play'] as string | undefined ||
          (info?.['data'] as Record<string, unknown> | undefined)?.['wmplay'] as string | undefined ||
          info?.['play'] as string | undefined ||
          info?.['wmplay'] as string | undefined

        if (!playUrl || typeof playUrl !== 'string') {
          throw new Error('download_failed: Scraper7 returned no play URL in response')
        }

        console.log('[video-downloader] Got Scraper7 play URL, downloading…')
        const result = await this.downloadFromUrl(playUrl)
        if (!result.success) {
          throw new Error(result.error ?? 'download_failed: downloadFromUrl failed')
        }
        return result

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        console.warn(`[video-downloader] Scraper7 attempt ${attempt}/${maxAttempts} failed: ${truncateOutput(lastError)}`)
      }
    }

    console.error('[video-downloader] All Scraper7 attempts failed:', lastError)
    return { success: false, error: lastError }
  }

  async downloadWithSupadata(url: string, apiKey: string): Promise<DownloadResult> {
    try {
      const supadataUrl = `https://api.supadata.ai/v1/download?url=${encodeURIComponent(url)}`

      const response = await fetch(supadataUrl, {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Supadata download failed: ${response.status}`)
      }

      const contentType = response.headers.get('content-type')

      if (contentType?.includes('application/json')) {
        const data = await response.json()
        if (data.downloadUrl) {
          return this.downloadFromUrl(data.downloadUrl)
        }

        throw new Error('No download URL in response')
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      await fs.mkdir(this.outputDir, { recursive: true })
      const filename = `video_${Date.now()}.mp4`
      const outputPath = path.join(this.outputDir, filename)

      await fs.writeFile(outputPath, buffer)

      return {
        success: true,
        filePath: outputPath,
        fileSize: buffer.length,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Fetch a direct video URL and save locally with up to 2 retries.
   * Used as the final step in both Scraper7 and Supadata paths.
   */
  private async downloadFromUrl(url: string, maxAttempts = 2): Promise<DownloadResult> {
    let lastError = 'Unknown error'

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        console.log(`[video-downloader] downloadFromUrl retry ${attempt}/${maxAttempts}…`)
        await new Promise(resolve => setTimeout(resolve, 1500))
      }

      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) })

        if (!response.ok) {
          throw new Error(`download_failed: HTTP ${response.status} from CDN`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        await fs.mkdir(this.outputDir, { recursive: true })
        const filename = `video_${Date.now()}_a${attempt}.mp4`
        const outputPath = path.join(this.outputDir, filename)

        await fs.writeFile(outputPath, buffer)
        console.log(`[video-downloader] downloadFromUrl (attempt ${attempt}): ${outputPath}`)

        return { success: true, filePath: outputPath, fileSize: buffer.length }

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        console.warn(`[video-downloader] downloadFromUrl attempt ${attempt}/${maxAttempts} failed: ${truncateOutput(lastError)}`)
      }
    }

    return { success: false, error: lastError }
  }

  async cleanup(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath)
      console.log(`Cleaned up: ${filePath}`)
    } catch (error) {
      console.error('Cleanup failed:', error)
    }
  }

  async cleanupOldFiles(olderThanHours: number = 24): Promise<void> {
    try {
      const files = await fs.readdir(this.outputDir)
      const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000

      for (const file of files) {
        const filePath = path.join(this.outputDir, file)
        const stats = await fs.stat(filePath)

        if (stats.mtimeMs < cutoffTime) {
          await fs.unlink(filePath)
          console.log(`Cleaned up old file: ${file}`)
        }
      }
    } catch (error) {
      console.error('Bulk cleanup failed:', error)
    }
  }
}

export function createVideoDownloader(options?: DownloadOptions): VideoDownloader {
  return new VideoDownloader(options)
}
