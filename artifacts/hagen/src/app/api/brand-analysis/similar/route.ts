/**
 * Brand Analysis Similar Videos API
 * 
 * GET /api/brand-analysis/similar?video_id=xxx
 * Find videos with similar brand ratings (RAG)
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const videoId = searchParams.get('video_id')
    const queryText = searchParams.get('query')
    const limit = parseInt(searchParams.get('limit') || '5')
    
    if (!videoId && !queryText) {
      return NextResponse.json(
        { error: 'video_id or query is required' },
        { status: 400 }
      )
    }
    
    let queryEmbedding: number[]
    
    if (videoId) {
      // Get the embedding from the video's brand rating
      const { data: rating } = await supabase
        .from('video_brand_ratings')
        .select('brand_embedding')
        .eq('video_id', videoId)
        .eq('rater_id', 'primary')
        .single()
      
      if (!rating?.brand_embedding) {
        // If no brand rating, try to use the video's content embedding
        const { data: video } = await supabase
          .from('analyzed_videos')
          .select('content_embedding')
          .eq('id', videoId)
          .single()
        
        if (!video?.content_embedding) {
          return NextResponse.json({
            success: true,
            similar_count: 0,
            videos: [],
            message: 'No embedding available for this video'
          })
        }
        
        queryEmbedding = video.content_embedding
      } else {
        queryEmbedding = rating.brand_embedding
      }
    } else if (queryText) {
      // Generate embedding from query text
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: queryText
      })
      queryEmbedding = response.data[0].embedding
    } else {
      return NextResponse.json(
        { error: 'No valid query source' },
        { status: 400 }
      )
    }
    
    // Use the RPC function to find similar videos
    // Note: If the function doesn't exist yet, fallback to manual query
    try {
      const { data: similar, error } = await supabase.rpc('find_similar_brand_ratings', {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: limit
      })
      
      if (error) throw error
      
      // Filter out the query video itself
      const filtered = (similar || []).filter((v: any) => v.video_id !== videoId)
      
      return NextResponse.json({
        success: true,
        similar_count: filtered.length,
        videos: filtered
      })
      
    } catch (rpcError) {
      // Fallback: manual vector search
      console.log('RPC not available, using manual query')
      
      const { data: allRatings } = await supabase
        .from('video_brand_ratings')
        .select(`
          id,
          video_id,
          personality_notes,
          statement_notes,
          brand_embedding,
          video:analyzed_videos(video_url)
        `)
        .not('brand_embedding', 'is', null)
        .limit(100)
      
      if (!allRatings || allRatings.length === 0) {
        return NextResponse.json({
          success: true,
          similar_count: 0,
          videos: [],
          message: 'No rated videos available for comparison'
        })
      }
      
      // Calculate cosine similarity manually
      const similarities = allRatings
        .filter(r => r.video_id !== videoId)
        .map(r => ({
          id: r.id,
          video_id: r.video_id,
          video_url: (r.video as any)?.video_url || '',
          personality_notes: r.personality_notes,
          statement_notes: r.statement_notes,
          similarity: cosineSimilarity(queryEmbedding, r.brand_embedding as number[])
        }))
        .filter(r => r.similarity > 0.5)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
      
      return NextResponse.json({
        success: true,
        similar_count: similarities.length,
        videos: similarities
      })
    }
    
  } catch (error) {
    console.error('Brand similar videos error:', error)
    return NextResponse.json(
      { error: 'Failed to find similar videos' },
      { status: 500 }
    )
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0
  
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  
  if (normA === 0 || normB === 0) return 0
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
