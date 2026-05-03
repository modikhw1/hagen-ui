/**
 * Brand Analysis API Route
 * 
 * POST /api/brand-analysis
 * Save a brand rating (personality + statement notes) for a video
 * 
 * GET /api/brand-analysis?video_id=xxx
 * Get existing brand rating for a video
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

/**
 * GET: Retrieve brand rating for a video
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const videoId = searchParams.get('video_id')
    const requestedRaterId = searchParams.get('rater_id') || 'primary'
    const fallback = searchParams.get('fallback') === 'true'
    
    if (!videoId) {
      return NextResponse.json(
        { error: 'video_id is required' },
        { status: 400 }
      )
    }
    
    const { data, error } = await supabase
      .from('video_brand_ratings')
      .select(`
        *,
        video:analyzed_videos(
          id,
          video_url,
          video_id,
          platform,
          metadata,
          visual_analysis
        )
      `)
      .eq('video_id', videoId)
      .eq('rater_id', requestedRaterId)
      .single()
    
    if (error && error.code !== 'PGRST116') {
      throw error
    }

    // Optional fallback: if no human/primary rating exists, return the latest AI/system (schema_v1) rating.
    // This is what allows the UI to display batch results without requiring a manual save.
    if (!data && fallback && requestedRaterId === 'primary') {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('video_brand_ratings')
        .select(`
          *,
          video:analyzed_videos(
            id,
            video_url,
            video_id,
            platform,
            metadata,
            visual_analysis
          )
        `)
        .eq('video_id', videoId)
        .eq('rater_id', 'schema_v1')
        .single()

      if (fallbackError && fallbackError.code !== 'PGRST116') {
        throw fallbackError
      }

      return NextResponse.json({
        success: true,
        rating: fallbackData || null
      })
    }
    
    return NextResponse.json({
      success: true,
      rating: data || null
    })
    
  } catch (error) {
    console.error('GET brand-analysis error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch brand rating' },
      { status: 500 }
    )
  }
}

/**
 * POST: Save a brand rating
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      video_id,
      video_url,
      personality_notes,
      statement_notes,
      corrections,
      ai_analysis,
      extracted_signals
    } = body
    
    // Validate required fields
    if (!video_id && !video_url) {
      return NextResponse.json(
        { error: 'video_id or video_url is required' },
        { status: 400 }
      )
    }
    
    // Find or create video record
    let videoId = video_id
    
    if (!videoId && video_url) {
      // Check if video exists
      const { data: existingVideo } = await supabase
        .from('analyzed_videos')
        .select('id')
        .eq('video_url', video_url)
        .single()
      
      if (existingVideo) {
        videoId = existingVideo.id
      } else {
        // Create new video entry
        const platformVideoId = extractPlatformVideoId(video_url)
        const platform = detectPlatform(video_url)
        
        const { data: newVideo, error: createError } = await supabase
          .from('analyzed_videos')
          .insert({
            video_url,
            video_id: platformVideoId,
            platform
          })
          .select('id')
          .single()
        
        if (createError) {
          throw createError
        }
        
        videoId = newVideo.id
      }
    }
    
    // Build embedding text from notes
    const embeddingText = buildEmbeddingText({
      personality_notes,
      statement_notes,
      corrections
    })
    
    // Generate embedding
    const embedding = await generateEmbedding(embeddingText)
    
    // Upsert brand rating
    const ratingData = {
      video_id: videoId,
      personality_notes: personality_notes || '',
      statement_notes: statement_notes || '',
      corrections: corrections || null,
      ai_analysis: ai_analysis || null,
      extracted_signals: extracted_signals || null,
      brand_embedding: embedding,
      rater_id: 'primary'
    }
    
    // Check if rating exists
    const { data: existingRating } = await supabase
      .from('video_brand_ratings')
      .select('id')
      .eq('video_id', videoId)
      .eq('rater_id', 'primary')
      .single()
    
    let data, error
    
    if (existingRating) {
      // Update
      const result = await supabase
        .from('video_brand_ratings')
        .update(ratingData)
        .eq('id', existingRating.id)
        .select()
        .single()
      data = result.data
      error = result.error
    } else {
      // Insert
      const result = await supabase
        .from('video_brand_ratings')
        .insert(ratingData)
        .select()
        .single()
      data = result.data
      error = result.error
    }
    
    if (error) {
      throw error
    }
    
    return NextResponse.json({
      success: true,
      id: data.id,
      video_id: videoId,
      message: 'Brand rating saved successfully'
    })
    
  } catch (error) {
    console.error('POST brand-analysis error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to save brand rating',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function extractPlatformVideoId(url: string): string {
  // TikTok: /video/1234567890
  const tiktokMatch = url.match(/video\/(\d+)/)
  if (tiktokMatch) return tiktokMatch[1]
  
  // YouTube: v=xxxxx or youtu.be/xxxxx
  const ytMatch = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  if (ytMatch) return ytMatch[1]
  
  // Instagram: /reel/xxxxx or /p/xxxxx
  const igMatch = url.match(/(?:reel|p)\/([a-zA-Z0-9_-]+)/)
  if (igMatch) return igMatch[1]
  
  // Fallback: hash the URL
  return url.replace(/[^a-zA-Z0-9]/g, '').slice(-20)
}

function detectPlatform(url: string): string {
  if (url.includes('tiktok')) return 'tiktok'
  if (url.includes('youtube') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('instagram')) return 'instagram'
  return 'unknown'
}

function buildEmbeddingText(data: {
  personality_notes?: string
  statement_notes?: string
  corrections?: string
}): string {
  const parts: string[] = []
  
  if (data.personality_notes) {
    parts.push(`Personality/Person: ${data.personality_notes}`)
  }
  
  if (data.statement_notes) {
    parts.push(`Statement/Message: ${data.statement_notes}`)
  }
  
  if (data.corrections) {
    parts.push(`Corrections: ${data.corrections}`)
  }
  
  return parts.join('\n\n')
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  })
  return response.data[0].embedding
}
