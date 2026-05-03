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
   * Download video using yt-dlp (most reliable for TikTok)
   *
   * Installation required:
   *   Ubuntu/Debian: sudo apt install python3 yt-dlp ffmpeg
   *   Mac: brew install yt-dlp
   *   Railway/Nixpacks: install python3, yt-dlp, ffmpeg via Nix packages
   */
  async downloadWithYtDlp(url: string): Promise<DownloadResult> {
    const ytDlpCommand = process.platform === 'win32'
      ? `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python314\\python.exe`
      : 'yt-dlp'

    try {
      await fs.mkdir(this.outputDir, { recursive: true })

      const filename = `video_${Date.now()}.mp4`
      const outputPath = path.join(this.outputDir, filename)

      console.log(`Downloading video: ${url}`)

      const args = process.platform === 'win32'
        ? [
            '-m', 'yt_dlp',
            '--no-cache-dir',
            '--no-playlist',
            '--format', 'best[ext=mp4]/best',
            '--max-filesize', `${this.maxFileSize}`,
            '--output', outputPath,
            '--no-warnings',
            url,
          ]
        : [
            '--no-cache-dir',
            '--no-playlist',
            '--format', 'best[ext=mp4]/best',
            '--max-filesize', `${this.maxFileSize}`,
            '--output', outputPath,
            '--no-warnings',
            url,
          ]

      console.log('[video-downloader] Running yt-dlp', {
        platform: process.platform,
        command: ytDlpCommand,
        outputPath,
        outputDir: this.outputDir,
      })

      const { stdout, stderr } = await spawnAsync(ytDlpCommand, args)

      if (stdout.trim()) {
        console.log('[video-downloader] yt-dlp stdout:', truncateOutput(stdout))
      }

      if (stderr.trim()) {
        console.warn('[video-downloader] yt-dlp stderr:', truncateOutput(stderr))
      }

      const stats = await fs.stat(outputPath).catch(() => null)
      if (!stats) {
        throw new Error('Download completed but file not found')
      }

      console.log(`Downloaded: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`)

      return {
        success: true,
        filePath: outputPath,
        fileSize: stats.size,
      }
    } catch (error) {
      const diagnostic = [
        `platform=${process.platform}`,
        `command=${ytDlpCommand}`,
        `outputDir=${this.outputDir}`,
        'hint=ensure python3,yt-dlp,ffmpeg are installed in runtime',
        error instanceof Error ? `cause=${truncateOutput(error.message)}` : 'cause=Unknown error',
      ].join(' | ')

      console.error('Download failed:', diagnostic)
      return {
        success: false,
        error: diagnostic,
      }
    }
  }

  async downloadWithScraper7(tiktokUrl: string, apiKey: string): Promise<DownloadResult> {
    try {
      const infoUrl = new URL('https://tiktok-scraper7.p.rapidapi.com/video/info')
      infoUrl.searchParams.set('url', tiktokUrl)

      console.log('[video-downloader] Fetching Scraper7 video info:', tiktokUrl)

      const infoRes = await fetch(infoUrl.toString(), {
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com',
        },
        signal: AbortSignal.timeout(15000),
      })

      if (!infoRes.ok) {
        throw new Error(`Scraper7 /video/info returned ${infoRes.status}`)
      }

      const info = await infoRes.json() as Record<string, any>
      const playUrl: string | undefined =
        info?.data?.play ||
        info?.data?.wmplay ||
        info?.play ||
        info?.wmplay

      if (!playUrl || typeof playUrl !== 'string') {
        throw new Error('Scraper7 returned no play URL')
      }

      console.log('[video-downloader] Got Scraper7 play URL, downloading...')

      return this.downloadFromUrl(playUrl)
    } catch (error) {
      console.error('[video-downloader] Scraper7 download failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
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

  private async downloadFromUrl(url: string): Promise<DownloadResult> {
    try {
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      await fs.mkdir(this.outputDir, { recursive: true })
      const filename = `video_${Date.now()}.mp4`
      const outputPath = path.join(this.outputDir, filename)

      await fs.writeFile(outputPath, buffer)

      console.log(`Downloaded from URL: ${outputPath}`)

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
