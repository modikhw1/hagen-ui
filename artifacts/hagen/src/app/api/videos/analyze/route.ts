import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { serviceRegistry } from '@/lib/services/registry'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

const analyzeRequestSchema = z.object({
  url: z.string().url('Invalid video URL'),
  skipIfExists: z.boolean().default(true),
  includeAnalysis: z.boolean().default(true),
  analysisOptions: z.object({
    detailLevel: z.enum(['basic', 'detailed', 'comprehensive']).default('comprehensive')
  }).optional()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, skipIfExists, includeAnalysis } = analyzeRequestSchema.parse(body)

    console.log(`📹 Analyzing video: ${url}`)

    // Check if video already exists
    if (skipIfExists) {
      const { data: existing } = await supabase
        .from('analyzed_videos')
        .select('id, video_url, metadata, visual_analysis')
        .eq('video_url', url)
        .single()

      if (existing) {
        // Get rating from video_ratings table
        const { data: rating } = await supabase
          .from('video_ratings')
          .select('overall_score, dimensions')
          .eq('video_id', existing.id)
          .single()

        console.log('✅ Video already analyzed, returning existing data')
        return NextResponse.json({
          id: existing.id,
          url: existing.video_url,
          metadata: existing.metadata,
          analysis: existing.visual_analysis,
          rating: rating,
          alreadyExists: true
        })
      }
    }

    // Step 1: Fetch metadata
    console.log('📊 Fetching metadata...')
    const metadataProvider = serviceRegistry.getMetadataProvider()
    const metadata = await metadataProvider.fetchMetadata(url)

    // Step 2: Calculate metrics
    console.log('📈 Calculating metrics...')
    const metricsCalculator = serviceRegistry.getMetricsCalculator()
    const computedMetrics = metricsCalculator.calculateMetrics({
      metadata,
      analysis: undefined
    })

    // Step 3: Save to database
    console.log('💾 Saving to database...')
    
    const { data: savedVideo, error: saveError } = await supabase
      .from('analyzed_videos')
      .insert({
        platform: metadata.platform,
        video_url: url,
        video_id: metadata.videoId,
        metadata: metadata as any,
        visual_analysis: null,
        analyzed_at: new Date().toISOString()
      })
      .select()
      .single()

    if (saveError) {
      console.error('❌ Database save failed:', saveError)
      throw new Error(`Failed to save video: ${saveError.message}`)
    }

    // Step 4: Save computed metrics
    if (savedVideo) {
      await supabase
        .from('video_metrics')
        .insert({
          video_id: savedVideo.id,
          ...computedMetrics,
          custom_metrics: {}
        })
    }

    console.log('✅ Video analysis complete and saved')

    return NextResponse.json({
      id: savedVideo.id,
      url: savedVideo.video_url,
      metadata,
      analysis: null,
      computedMetrics,
      message: 'Video analyzed successfully'
    })

  } catch (error) {
    console.error('❌ Analysis failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'validation-error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        error: 'analysis-failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// GET - Retrieve analyzed video by ID or URL
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')
    const url = searchParams.get('url')
    const rated = searchParams.get('rated') === 'true'
    const count = searchParams.get('count') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // List mode
    if (!id && !url) {
      let query = supabase
        .from('analyzed_videos')
        .select('*, rating:video_ratings(overall_score, dimensions)', { count: 'exact' })

      if (rated) {
        // Filter to only videos with ratings
        query = query.not('rating', 'is', null)
      }

      if (count) {
        const { count: totalCount } = await query
        return NextResponse.json({ count: totalCount || 0 })
      }

      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      const { data: videos, error, count: totalCount } = await query

      if (error) {
        throw new Error(`Failed to fetch videos: ${error.message}`)
      }

      return NextResponse.json({
        videos: videos || [],
        total: totalCount || 0,
        limit,
        offset
      })
    }

    // Single video mode
    let query = supabase
      .from('analyzed_videos')
      .select(`
        *,
        video_metrics (*)
      `)

    if (id) {
      query = query.eq('id', id)
    } else if (url) {
      query = query.eq('video_url', url)
    }

    const { data, error } = await query.single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'not-found', message: 'Video not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(data)

  } catch (error) {
    console.error('❌ Fetch failed:', error)
    return NextResponse.json(
      { error: 'fetch-failed', message: 'Failed to retrieve video' },
      { status: 500 }
    )
  }
}
