import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

const similarRequestSchema = z.object({
  videoId: z.string().uuid('Invalid video ID').optional(),
  embedding: z.array(z.number()).optional(),
  limit: z.number().min(1).max(100).default(10),
  threshold: z.number().min(0).max(1).default(0.7),
  filters: z.object({
    platform: z.enum(['tiktok', 'youtube']).optional(),
    minViews: z.number().optional(),
    maxViews: z.number().optional(),
    tags: z.array(z.string()).optional(),
    rated: z.boolean().optional()
  }).optional()
}).refine(data => data.videoId || data.embedding, {
  message: 'Either videoId or embedding must be provided'
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { videoId, embedding: providedEmbedding, limit, threshold, filters } = similarRequestSchema.parse(body)

    console.log(`🔍 Finding similar videos (limit: ${limit}, threshold: ${threshold})`)

    let queryEmbedding = providedEmbedding

    // If videoId provided, get its embedding
    if (videoId && !providedEmbedding) {
      const { data: video, error } = await supabase
        .from('analyzed_videos')
        .select('content_embedding')
        .eq('id', videoId)
        .single()

      if (error || !video) {
        return NextResponse.json(
          { error: 'not-found', message: 'Video not found' },
          { status: 404 }
        )
      }

      if (!video.content_embedding) {
        return NextResponse.json(
          { error: 'no-embedding', message: 'Video has no embedding' },
          { status: 400 }
        )
      }

      queryEmbedding = video.content_embedding
    }

    if (!queryEmbedding) {
      return NextResponse.json(
        { error: 'no-embedding', message: 'No embedding available' },
        { status: 400 }
      )
    }

    // Use the find_similar_videos function
    const { data: similarVideos, error: searchError } = await supabase
      .rpc('find_similar_videos', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit
      })

    if (searchError) {
      console.error('❌ Similarity search failed:', searchError)
      throw new Error(`Similarity search failed: ${searchError.message}`)
    }

    // Apply additional filters if provided
    let filtered = similarVideos || []

    if (filters) {
      if (filters.platform) {
        filtered = filtered.filter((v: any) => v.platform === filters.platform)
      }

      if (filters.minViews !== undefined) {
        filtered = filtered.filter((v: any) => 
          (v.metadata?.stats?.viewCount || 0) >= filters.minViews!
        )
      }

      if (filters.maxViews !== undefined) {
        filtered = filtered.filter((v: any) => 
          (v.metadata?.stats?.viewCount || 0) <= filters.maxViews!
        )
      }

      if (filters.tags && filters.tags.length > 0) {
        filtered = filtered.filter((v: any) => 
          v.tags?.some((tag: string) => filters.tags!.includes(tag))
        )
      }

      if (filters.rated !== undefined) {
        if (filters.rated) {
          filtered = filtered.filter((v: any) => v.rating !== null)
        } else {
          filtered = filtered.filter((v: any) => v.rating === null)
        }
      }
    }

    // Exclude the query video itself
    if (videoId) {
      filtered = filtered.filter((v: any) => v.id !== videoId)
    }

    // Limit results
    filtered = filtered.slice(0, limit)

    console.log(`✅ Found ${filtered.length} similar videos`)

    return NextResponse.json({
      count: filtered.length,
      threshold,
      similarVideos: filtered.map((v: any) => ({
        id: v.id,
        video_url: v.video_url,
        platform: v.platform,
        similarity: v.similarity,
        metadata: v.metadata,
        rating: v.rating,
        user_tags: v.tags,
        analyzed_at: v.analyzed_at
      }))
    })

  } catch (error) {
    console.error('❌ Similar videos search failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'validation-error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        error: 'search-failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// GET - Find similar videos by video ID (simpler interface)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const videoId = searchParams.get('videoId')
    const limit = parseInt(searchParams.get('limit') || '10')
    const threshold = parseFloat(searchParams.get('threshold') || '0.7')

    if (!videoId) {
      return NextResponse.json(
        { error: 'missing-parameter', message: 'videoId is required' },
        { status: 400 }
      )
    }

    // Call POST handler with simplified parameters
    return POST(new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({ videoId, limit, threshold })
    }))

  } catch (error) {
    console.error('❌ Similar videos fetch failed:', error)
    return NextResponse.json(
      { error: 'fetch-failed', message: 'Failed to find similar videos' },
      { status: 500 }
    )
  }
}
