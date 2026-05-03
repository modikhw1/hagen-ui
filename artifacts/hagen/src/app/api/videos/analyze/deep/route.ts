/**
 * Deep Video Analysis API
 * 
 * Full pipeline: Download → Upload to Cloud → Analyze with Gemini → Save results
 * 
 * POST /api/videos/analyze/deep
 * Body: { videoId: string }
 * 
 * Prerequisite: Video must already exist in analyzed_videos table
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createVideoDownloader, type DownloadResult } from '@/lib/services/video/downloader'
import { createVideoStorageService } from '@/lib/services/video/storage'
import { GeminiVideoAnalyzer } from '@/lib/services/video/gemini'
import { BrandAnalyzer } from '@/lib/services/brand/brand-analyzer'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const deepAnalysisSchema = z.object({
  videoId: z.string().uuid('Invalid video ID'),
  detailLevel: z.enum(['basic', 'detailed', 'comprehensive']).default('comprehensive'),
  skipDownload: z.boolean().default(false), // If you already have the file
  cleanupAfter: z.boolean().default(true),
  useSchemaV1: z.boolean().default(false) // Enable Schema v1.1 via BrandAnalyzer
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { videoId, detailLevel, skipDownload, cleanupAfter, useSchemaV1 } = deepAnalysisSchema.parse(body)

    console.log(`🎬 Starting deep analysis for video: ${videoId}`)

    // Step 1: Get video data from database
    const { data: video, error: fetchError } = await supabase
      .from('analyzed_videos')
      .select('*')
      .eq('id', videoId)
      .single()

    if (fetchError || !video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      )
    }

    // Check prerequisites
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { 
          error: 'gemini-not-configured',
          message: 'GEMINI_API_KEY environment variable not set',
          setupGuide: '/DEEP_ANALYSIS_SETUP.md'
        },
        { status: 503 }
      )
    }

    let localFilePath: string | undefined
    let cloudUrl: string | undefined

    try {
      // Step 2: Download video (if not skipped)
      if (!skipDownload) {
        console.log('📥 Downloading video...')
        const downloader = createVideoDownloader()
        
        const rapidApiKey = process.env.RAPIDAPI_KEY?.trim()

        // 1. Scraper7 (primary - reliable for TikTok, no IP blocking)
        let downloadResult: DownloadResult = rapidApiKey
          ? await downloader.downloadWithScraper7(video.video_url, rapidApiKey)
          : { success: false, error: 'RAPIDAPI_KEY not set' }

        // 2. yt-dlp (secondary - may work for non-TikTok or if Scraper7 fails)
        if (!downloadResult.success) {
          console.log('[deep-analyze] Scraper7 failed, trying yt-dlp:', downloadResult.error)
          downloadResult = await downloader.downloadWithYtDlp(video.video_url)
        }

        // 3. Supadata (tertiary)
        if (!downloadResult.success && process.env.SUPADATA_API_KEY) {
          console.log('[deep-analyze] yt-dlp failed, trying Supadata:', downloadResult.error)
          const supadataResult = await downloader.downloadWithSupadata(
            video.video_url,
            process.env.SUPADATA_API_KEY
          )
          if (supadataResult.success) {
            downloadResult = supadataResult
          }
        }

        if (!downloadResult.success) {
          throw new Error(`Download failed: ${downloadResult.error}`)
        }

        localFilePath = downloadResult.filePath

        console.log(`✅ Downloaded: ${localFilePath}`)
      }

      // Step 3: Upload to Gemini File API (required for Gemini analysis)
      // Note: GCS URLs don't work directly with Gemini - must use Gemini's File API
      if (localFilePath) {
        console.log('☁️ Uploading to Gemini File API...')
        const storage = createVideoStorageService()
        const uploadResult = await storage.uploadToGeminiFileAPI(localFilePath)
        
        if (!uploadResult.success) {
          throw new Error(`Gemini upload failed: ${uploadResult.error}`)
        }
        
        cloudUrl = uploadResult.gsUrl
        console.log(`✅ Uploaded to Gemini: ${cloudUrl}`)
      }

      // Step 4: Analyze with Gemini
      if (!cloudUrl) {
        throw new Error('No cloud URL available for analysis')
      }

      let analysis: any
      let schemaV1Signals: any = null
      let mergedCallUsed = false
      
      // Build video metadata for learning context retrieval
      // Include as much context as possible for better RAG matching
      const videoMetadata = {
        title: video.title || video.metadata?.title || '',
        description: video.description || video.metadata?.description || '',
        hashtags: video.metadata?.hashtags || [],
        industry: video.visual_analysis?.industry || (video.brand_id ? 'restaurant' : 'hospitality'),
        contentFormat: video.visual_analysis?.content?.format || video.metadata?.content_format,
        // Include previous analysis summary for better matching
        transcript: video.visual_analysis?.script?.transcript?.slice(0, 500),
        existingAnalysis: video.visual_analysis
      }
      
      console.log('📚 Learning metadata:', {
        hasTitle: !!videoMetadata.title,
        hasDescription: !!videoMetadata.description,
        industry: videoMetadata.industry,
        hasTranscript: !!videoMetadata.transcript
      })
      
      const legacyAnalyzer = new GeminiVideoAnalyzer()

      if (useSchemaV1) {
        // MERGED PATH — one Gemini round-trip produces both the display
        // analysis AND the Schema v1.1 σTaste signals via tagged sentinels
        // in the prompt. This halves Gemini cost vs the previous
        // analyzeVideo + BrandAnalyzer fan-out.
        console.log('🤖 Analyzing with Gemini (merged display + σTaste, single call)...')
        try {
          const merged = await legacyAnalyzer.analyzeVideoCombined(cloudUrl, {
            detailLevel,
            useLearning: true,
            videoMetadata
          })
          analysis = merged.analysis
          mergedCallUsed = true
          if (merged.schemaV1) {
            analysis.schema_v1_signals = merged.schemaV1.signals
            analysis.schema_version = 1
            console.log('✅ Merged σTaste signals extracted:', {
              hasReplicability: !!merged.schemaV1.signals?.replicability,
              hasEnvironment: !!merged.schemaV1.signals?.environment_requirements,
              hasRisk: !!merged.schemaV1.signals?.risk_level,
              confidenceOverall: merged.schemaV1.confidence?.overall_0_1 ?? null
            })
          } else {
            console.warn('⚠️ Merged call returned no σTaste block:', merged.schemaV1ParseError)
            // Fall back to a separate BrandAnalyzer call so we don't lose
            // signals when sentinels are missing — still cheaper on average
            // because it only triggers on parse failure.
            await runBrandAnalyzerFallback()
          }
        } catch (mergedErr: any) {
          console.error('❌ Merged Gemini call failed, falling back to two-call path:', {
            errorMessage: mergedErr?.message || String(mergedErr)
          })
          analysis = await legacyAnalyzer.analyzeVideo(cloudUrl, {
            detailLevel, useLearning: true, videoMetadata
          })
          await runBrandAnalyzerFallback()
        }
      } else {
        // No Schema v1 requested — single legacy call as before.
        console.log('🤖 Analyzing with Gemini (display only)...')
        analysis = await legacyAnalyzer.analyzeVideo(cloudUrl, {
          detailLevel,
          useLearning: true,
          videoMetadata
        })
      }

      async function runBrandAnalyzerFallback() {
        const brandAnalyzer = new BrandAnalyzer()
        const isGcsUri = cloudUrl!.startsWith('gs://')
        try {
          schemaV1Signals = await brandAnalyzer.analyze({
            videoUrl: video.video_url,
            videoId: video.video_id || videoId,
            gcsUri: isGcsUri ? cloudUrl : undefined,
            geminiFileUri: !isGcsUri ? cloudUrl : undefined
          })
          analysis.schema_v1_signals = schemaV1Signals.raw_output?.signals || schemaV1Signals.signals
          analysis.schema_version = 1
        } catch (v1Error: any) {
          console.error('❌ Schema v1.1 fallback extraction failed:', {
            errorMessage: v1Error?.message || String(v1Error)
          })
        }
      }

      // Step 5: Save analysis to database
      console.log('💾 Saving analysis results...')
      const { error: updateError } = await supabase
        .from('analyzed_videos')
        .update({
          visual_analysis: analysis,
          analyzed_at: new Date().toISOString()
        })
        .eq('id', videoId)

      if (updateError) {
        console.error('Failed to save analysis:', updateError)
        // Continue anyway - we have the analysis
      }

      // Step 6: Regenerate embedding with new data
      console.log('🔄 Regenerating embedding with analysis data...')
      
      // Get embedding provider
      const { serviceRegistry } = await import('@/lib/services/registry')
      const embeddingProvider = serviceRegistry.getEmbeddingProvider()
      
      // Get existing ratings from video_ratings table
      const { data: existingRating } = await supabase
        .from('video_ratings')
        .select('overall_score, dimensions')
        .eq('video_id', videoId)
        .single()

      // Prepare comprehensive text for embedding
      const embeddingText = embeddingProvider.prepareTextForEmbedding({
        metadata: video.metadata,
        analysis,
        userRatings: existingRating || undefined,
        userTags: video.user_tags,
        computedMetrics: {} // Could recalculate with new data
      })
      
      const embedding = await embeddingProvider.generateEmbedding(embeddingText)
      
      // Update embedding
      await supabase
        .from('analyzed_videos')
        .update({ content_embedding: embedding })
        .eq('id', videoId)

      console.log('✅ Deep analysis complete!', { mergedCallUsed })
      console.log('🔍 Final analysis object keys:', Object.keys(analysis))
      console.log('🔍 schema_v1_signals present:', !!analysis.schema_v1_signals)
      if (analysis.schema_v1_signals) {
        console.log('🔍 schema_v1_signals keys:', Object.keys(analysis.schema_v1_signals))
      }

      // Step 7: Cleanup
      if (cleanupAfter && localFilePath) {
        const downloader = createVideoDownloader()
        await downloader.cleanup(localFilePath)
      }

      return NextResponse.json({
        success: true,
        videoId,
        analysis,
        message: 'Deep analysis completed successfully'
      })

    } catch (analysisError) {
      // Cleanup on error
      if (localFilePath && cleanupAfter) {
        try {
          const downloader = createVideoDownloader()
          await downloader.cleanup(localFilePath)
        } catch (cleanupError) {
          console.error('Cleanup failed:', cleanupError)
        }
      }

      throw analysisError
    }

  } catch (error) {
    console.error('❌ Deep analysis failed:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'validation-error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        error: 'deep-analysis-failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        setupGuide: 'See /DEEP_ANALYSIS_SETUP.md for configuration help'
      },
      { status: 500 }
    )
  }
}

/**
 * GET - Check if deep analysis is configured and available
 */
export async function GET(request: NextRequest) {
  const checks = {
    geminiApiKey: !!process.env.GEMINI_API_KEY,
    supadataApiKey: !!process.env.SUPADATA_API_KEY,
    googleCloudProject: !!process.env.GOOGLE_CLOUD_PROJECT_ID,
    googleCloudBucket: !!process.env.GOOGLE_CLOUD_STORAGE_BUCKET,
    googleCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS
  }

  const isFullyConfigured = checks.geminiApiKey
  const hasCloudStorage = checks.googleCloudProject && checks.googleCloudBucket

  return NextResponse.json({
    available: isFullyConfigured,
    configuration: checks,
    mode: hasCloudStorage ? 'cloud-storage' : 'gemini-file-api',
    recommendations: [
      !checks.geminiApiKey && 'Set GEMINI_API_KEY in .env.local',
      !checks.googleCloudProject && 'Optional: Set up Google Cloud Storage for permanent video storage',
      !checks.supadataApiKey && 'Warning: No fallback download method available'
    ].filter(Boolean),
    setupGuide: '/DEEP_ANALYSIS_SETUP.md'
  })
}
