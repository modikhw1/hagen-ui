/**
 * Batch Video Analysis API
 * 
 * Analyzes multiple videos with Gemini V2 analysis (110-130 factors)
 * 
 * POST /api/videos/analyze/batch
 * Body: { limit?: number, skipExisting?: boolean }
 * 
 * GET /api/videos/analyze/batch
 * Returns status of videos needing analysis
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GeminiVideoAnalyzer } from '@/lib/services/video/gemini'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

interface BatchResult {
  videoId: string
  success: boolean
  error?: string
  duration?: number
}

/**
 * GET - Check batch analysis status
 */
export async function GET() {
  try {
    // Get videos that have been uploaded to GCS but not analyzed
    const { data: allVideos, error: fetchError } = await supabase
      .from('analyzed_videos')
      .select('id, gcs_uri, visual_analysis, metadata')
      .not('gcs_uri', 'is', null)
      .order('created_at', { ascending: false })

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Debug: Check what visual_analysis actually contains
    const sampleVideo = allVideos?.[0]
    console.log('Sample video visual_analysis:', typeof sampleVideo?.visual_analysis, sampleVideo?.visual_analysis)
    
    const needsAnalysis = (allVideos || []).filter(v => {
      // Check if visual_analysis is null, undefined, or empty object
      const va = v.visual_analysis
      return !va || (typeof va === 'object' && Object.keys(va).length === 0)
    })
    const hasAnalysis = (allVideos || []).filter(v => {
      const va = v.visual_analysis
      return va && typeof va === 'object' && Object.keys(va).length > 0
    })

    return NextResponse.json({
      total_uploaded: allVideos?.length || 0,
      needs_analysis: needsAnalysis.length,
      already_analyzed: hasAnalysis.length,
      sample_visual_analysis_type: typeof sampleVideo?.visual_analysis,
      sample_visual_analysis_keys: sampleVideo?.visual_analysis ? Object.keys(sampleVideo.visual_analysis) : null,
      pending_videos: needsAnalysis.slice(0, 10).map(v => ({
        id: v.id,
        title: v.metadata?.title || 'Untitled',
        gcs_uri: v.gcs_uri
      }))
    })
  } catch (err) {
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 })
  }
}

/**
 * POST - Run batch analysis
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const limit = Math.min(body.limit || 5, 20) // Cap at 20 per batch
    const skipExisting = body.skipExisting !== false // Default true

    console.log(`🎬 Starting batch analysis (limit: ${limit}, skipExisting: ${skipExisting})`)

    // Check Gemini is configured
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({
        error: 'gemini-not-configured',
        message: 'GEMINI_API_KEY not set'
      }, { status: 503 })
    }

    // Get videos that need analysis
    let query = supabase
      .from('analyzed_videos')
      .select('id, gcs_uri, video_url, metadata, visual_analysis')
      .not('gcs_uri', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (skipExisting) {
      query = query.is('visual_analysis', null)
    }

    const { data: videos, error: fetchError } = await query

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!videos || videos.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No videos need analysis',
        results: []
      })
    }

    console.log(`📋 Found ${videos.length} videos to analyze`)

    // Initialize analyzer
    const analyzer = new GeminiVideoAnalyzer()
    const results: BatchResult[] = []

    // Process videos sequentially to avoid rate limits
    for (const video of videos) {
      const startTime = Date.now()
      console.log(`\n🔍 Analyzing: ${video.metadata?.title || video.id}`)

      try {
        // Use GCS URI for analysis
        const cloudUrl = video.gcs_uri

        if (!cloudUrl) {
          results.push({
            videoId: video.id,
            success: false,
            error: 'No GCS URI available'
          })
          continue
        }

        // Build video metadata for learning context
        const videoMetadata = {
          title: video.metadata?.title || '',
          description: video.metadata?.description || '',
          industry: video.visual_analysis?.industry,
          contentFormat: video.visual_analysis?.content?.format,
          existingAnalysis: video.visual_analysis
        }

        // Analyze with Gemini (with learning from corrected examples)
        const analysis = await analyzer.analyzeVideo(cloudUrl, {
          detailLevel: 'comprehensive',
          useLearning: true,
          videoMetadata
        })

        // Save analysis to database
        const { error: updateError } = await supabase
          .from('analyzed_videos')
          .update({
            visual_analysis: analysis,
            analyzed_at: new Date().toISOString()
          })
          .eq('id', video.id)

        if (updateError) {
          console.error(`Failed to save analysis for ${video.id}:`, updateError)
          results.push({
            videoId: video.id,
            success: false,
            error: `Save failed: ${updateError.message}`,
            duration: Date.now() - startTime
          })
          continue
        }

        const duration = Date.now() - startTime
        console.log(`✅ Completed: ${video.id} (${(duration / 1000).toFixed(1)}s)`)

        results.push({
          videoId: video.id,
          success: true,
          duration
        })

        // Small delay between videos to be nice to the API
        if (videos.indexOf(video) < videos.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

      } catch (analysisError) {
        console.error(`❌ Failed: ${video.id}`, analysisError)
        results.push({
          videoId: video.id,
          success: false,
          error: analysisError instanceof Error ? analysisError.message : 'Analysis failed',
          duration: Date.now() - startTime
        })
      }
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    const totalTime = results.reduce((sum, r) => sum + (r.duration || 0), 0)

    console.log(`\n📊 Batch complete: ${successful} succeeded, ${failed} failed`)

    return NextResponse.json({
      success: true,
      summary: {
        total: results.length,
        successful,
        failed,
        totalTimeMs: totalTime,
        avgTimeMs: results.length > 0 ? Math.round(totalTime / results.length) : 0
      },
      results
    })

  } catch (err) {
    console.error('Batch analysis error:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 })
  }
}
