/**
 * Cloud Storage Service for Videos
 * 
 * Uploads downloaded videos to Google Cloud Storage
 * Required for Gemini File API
 */

import { Storage } from '@google-cloud/storage'
import fs from 'fs/promises'
import path from 'path'

export interface StorageOptions {
  projectId?: string
  bucketName?: string
  credentialsPath?: string
}

export interface UploadResult {
  success: boolean
  publicUrl?: string
  gsUrl?: string // gs://bucket/file format for Gemini
  error?: string
}

export class VideoStorageService {
  private storage?: Storage
  private bucketName: string
  private bucket?: any
  private useGCS: boolean

  constructor(options: StorageOptions = {}) {
    const projectId = options.projectId || process.env.GOOGLE_CLOUD_PROJECT_ID
    const credentialsPath = options.credentialsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS
    const credentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64
    this.bucketName = options.bucketName || process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'hagen-video-analysis'

    // Only initialize GCS if credentials are provided
    this.useGCS = !!projectId

    if (this.useGCS) {
      const storageConfig: any = { projectId }

      if (credentialsBase64) {
        // Railway / cloud deployment: credentials passed as base64-encoded JSON
        storageConfig.credentials = JSON.parse(Buffer.from(credentialsBase64, 'base64').toString('utf-8'))
      } else if (credentialsPath) {
        // Local development: credentials file path
        storageConfig.keyFilename = credentialsPath
      }

      this.storage = new Storage(storageConfig)
      this.bucket = this.storage.bucket(this.bucketName)
    }
  }

  /**
   * Generic upload to GCS
   */
  async upload(localFilePath: string, destinationPath: string): Promise<string> {
    if (!this.useGCS || !this.bucket) {
      throw new Error('Google Cloud Storage not configured');
    }

    try {
      console.log(`☁️ Uploading to GCS: ${localFilePath} -> ${destinationPath}`)

      await this.bucket.upload(localFilePath, {
        destination: destinationPath,
        metadata: {
          contentType: 'video/mp4'
        }
      })

      const gsUrl = `gs://${this.bucketName}/${destinationPath}`
      console.log(`✅ Uploaded to GCS: ${gsUrl}`)

      return gsUrl

    } catch (error) {
      console.error('❌ Upload to GCS failed:', error)
      throw error
    }
  }

  /**
   * Upload video file to Google Cloud Storage with exponential backoff retry.
   * Mirrors the retry pattern used in uploadToGeminiFileAPI (3 attempts, 2s/4s backoff).
   *
   * @param localFilePath  Absolute path to the local file to upload
   * @param videoId        Logical video ID; used as the GCS object name stem
   * @param maxAttempts    Max upload attempts (default: 3)
   */
  async uploadVideo(
    localFilePath: string,
    videoId: string,
    maxAttempts = 3,
  ): Promise<UploadResult> {
    if (!this.useGCS || !this.bucket) {
      return {
        success: false,
        error: 'GCS_NOT_CONFIGURED: Google Cloud Storage not configured. Use uploadToGeminiFileAPI instead.',
      }
    }

    const ext = path.extname(localFilePath)
    const filename = `videos/${videoId}${ext}`
    let lastError = 'unknown'

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        const delayMs = 2000 * Math.pow(2, attempt - 2)   // 2 000 ms, 4 000 ms
        console.log(`☁️ GCS upload attempt ${attempt}/${maxAttempts} (backoff ${delayMs}ms)…`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      } else {
        console.log(`☁️ Uploading to GCS: ${localFilePath} → ${filename}`)
      }

      try {
        await this.bucket.upload(localFilePath, {
          destination: filename,
          metadata: {
            contentType: 'video/mp4',
            metadata: { videoId, uploadedAt: new Date().toISOString() },
          },
        })

        const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${filename}`
        const gsUrl = `gs://${this.bucketName}/${filename}`
        console.log(`✅ Uploaded to GCS (attempt ${attempt}): ${gsUrl}`)
        return { success: true, publicUrl, gsUrl }

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        console.error(`❌ GCS upload attempt ${attempt}/${maxAttempts} failed:`, lastError)
        // Continue loop — try again unless this was the last attempt
      }
    }

    return { success: false, error: `GCS_UPLOAD_ERROR: ${lastError}` }
  }

  /**
   * Upload to Gemini File API (alternative approach)
   * This uploads directly to Gemini's temporary storage
   */
  async uploadToGeminiFileAPI(
    localFilePath: string,
    mimeType: string = 'video/mp4',
    maxAttempts = 3,
  ): Promise<UploadResult> {
    const { GoogleAIFileManager, FileState } = await import('@google/generative-ai/server')
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!)

    let lastError = 'unknown'

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          const delayMs = 2000 * Math.pow(2, attempt - 2)
          console.log(`☁️ Gemini File API upload attempt ${attempt}/${maxAttempts} (backoff ${delayMs}ms)…`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
        } else {
          console.log(`☁️ Uploading to Gemini File API: ${localFilePath}`)
        }

        const uploadResult = await fileManager.uploadFile(localFilePath, {
          mimeType,
          displayName: path.basename(localFilePath),
        })

        console.log(`⏳ File uploaded (attempt ${attempt}), waiting for processing: ${uploadResult.file.name}`)

        let file = uploadResult.file
        let pollCount = 0
        const maxPolls = 30
        while (file.state === FileState.PROCESSING && pollCount < maxPolls) {
          await new Promise(resolve => setTimeout(resolve, 2000))
          file = await fileManager.getFile(file.name)
          pollCount++
          console.log(`   File state: ${file.state} (poll ${pollCount}/${maxPolls})`)
        }

        if (file.state !== FileState.ACTIVE) {
          throw new Error(
            `GEMINI_FILE_NOT_ACTIVE: final state=${file.state} after ${pollCount} polls`,
          )
        }

        console.log(`✅ File ready for analysis: ${file.uri}`)
        return { success: true, gsUrl: file.uri }

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        const code = lastError.startsWith('GEMINI_FILE_NOT_ACTIVE')
          ? 'GEMINI_FILE_NOT_ACTIVE'
          : 'GEMINI_UPLOAD_ERROR'
        console.error(`❌ Upload attempt ${attempt}/${maxAttempts} failed [${code}]:`, lastError)
        if (attempt === maxAttempts) {
          return { success: false, error: `${code}: ${lastError}` }
        }
      }
    }

    return { success: false, error: `GEMINI_UPLOAD_ERROR: ${lastError}` }
  }

  /**
   * Delete video from storage
   */
  async deleteVideo(gsUrl: string): Promise<void> {
    try {
      // Extract filename from gs:// URL
      const filename = gsUrl.replace(`gs://${this.bucketName}/`, '')
      await this.bucket.file(filename).delete()
      console.log(`🗑️ Deleted from GCS: ${filename}`)
    } catch (error) {
      console.error('Delete from GCS failed:', error)
    }
  }

  /**
   * Check if bucket exists and is accessible
   */
  async verifyBucket(): Promise<boolean> {
    try {
      if (!this.storage) {
        console.error('GCS not configured')
        return false
      }
      const [exists] = await this.bucket.exists()
      if (!exists) {
        console.log(`📦 Creating bucket: ${this.bucketName}`)
        await this.storage.createBucket(this.bucketName, {
          location: 'US',
          storageClass: 'STANDARD'
        })
      }
      return true
    } catch (error) {
      console.error('Bucket verification failed:', error)
      return false
    }
  }
}

export function createVideoStorageService(options?: StorageOptions): VideoStorageService {
  return new VideoStorageService(options)
}
