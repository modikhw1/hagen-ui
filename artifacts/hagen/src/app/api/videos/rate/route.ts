import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { serviceRegistry } from '@/lib/services/registry'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

const rateRequestSchema = z.object({
  videoId: z.string().uuid('Invalid video ID'),
  ratings: z.record(z.union([z.number(), z.string(), z.boolean()])),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  regenerateEmbedding: z.boolean().default(true)
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { videoId, ratings, tags, notes, regenerateEmbedding } = rateRequestSchema.parse(body)

    console.log(`⭐ Rating video ${videoId}`)

    // Get existing video
    const { data: video, error: fetchError } = await supabase
      .from('analyzed_videos')
      .select('*, video_metrics(*)')
      .eq('id', videoId)
      .single()

    if (fetchError || !video) {
      return NextResponse.json(
        { error: 'not-found', message: 'Video not found' },
        { status: 404 }
      )
    }

    // Update tags and notes only (ratings go to video_ratings table)
    const { error: updateError } = await supabase
      .from('analyzed_videos')
      .update({
        user_tags: tags || video.user_tags,
        user_notes: notes || video.user_notes,
        rated_at: new Date().toISOString()
      })
      .eq('id', videoId)

    if (updateError) {
      throw new Error(`Failed to update video metadata: ${updateError.message}`)
    }

    // Regenerate embedding with new ratings
    if (regenerateEmbedding) {
      console.log('🔄 Regenerating embedding with user ratings...')
      
      const embeddingProvider = serviceRegistry.getEmbeddingProvider()
      
      // Get existing ratings from video_ratings table
      const { data: existingRating } = await supabase
        .from('video_ratings')
        .select('overall_score, dimensions')
        .eq('video_id', videoId)
        .single()

      // Prepare text representation combining all data
      const embeddingText = embeddingProvider.prepareTextForEmbedding({
        metadata: video.metadata,
        analysis: video.visual_analysis,
        userRatings: existingRating || { overall_score: ratings.overall, dimensions: ratings },
        userTags: tags || video.user_tags,
        computedMetrics: video.video_metrics?.[0] || {}
      })
      
      console.log('📝 Embedding text sample:', embeddingText.substring(0, 200))
      
      // Generate embedding from text
      const embedding = await embeddingProvider.generateEmbedding(embeddingText)
      
      console.log('🔢 Embedding generated:', embedding.length, 'dimensions')

      const { error: embeddingError } = await supabase
        .from('analyzed_videos')
        .update({ content_embedding: embedding })
        .eq('id', videoId)
      
      if (embeddingError) {
        console.error('❌ Failed to save embedding:', embeddingError)
        throw new Error(`Failed to save embedding: ${embeddingError.message}`)
      }
      
      console.log('✅ Embedding updated successfully')
    }

    // Save ratings to video_ratings table (primary storage)
    const overallScore = typeof ratings.overall === 'number' ? ratings.overall : 0.7;
    const { error: ratingsError } = await supabase
      .from('video_ratings')
      .upsert({
        video_id: videoId,
        overall_score: overallScore,
        dimensions: {
          hook: ratings.hook || overallScore,
          pacing: ratings.pacing || overallScore,
          originality: ratings.originality || overallScore,
          payoff: ratings.payoff || overallScore,
          rewatchable: ratings.rewatchable || overallScore
        },
        notes: notes || '',
        tags: tags || [],
        rated_at: new Date().toISOString()
      }, { onConflict: 'video_id' });
    
    if (ratingsError) {
      throw new Error(`Failed to save rating: ${ratingsError.message}`);
    }
    
    console.log('✅ Rating saved to video_ratings table');

    // Check if we should update rating schema
    const { data: currentSchema } = await supabase
      .from('rating_schema_versions')
      .select('*')
      .eq('is_active', true)
      .single()

    if (currentSchema) {
      const schemaFields = currentSchema.schema.fields || []
      const newFields = Object.keys(ratings).filter(
        key => !schemaFields.some((f: any) => f.name === key)
      )

      if (newFields.length > 0) {
        console.log('📋 New rating fields detected:', newFields)
        // Note: In a real implementation, you might want to trigger schema evolution here
      }
    }

    console.log('✅ Rating saved successfully')

    return NextResponse.json({
      videoId,
      overall_score: overallScore,
      dimensions: {
        hook: ratings.hook || overallScore,
        pacing: ratings.pacing || overallScore,
        originality: ratings.originality || overallScore,
        payoff: ratings.payoff || overallScore,
        rewatchable: ratings.rewatchable || overallScore
      },
      tags: tags || video.user_tags,
      embeddingRegenerated: regenerateEmbedding,
      message: 'Rating saved successfully'
    })

  } catch (error) {
    console.error('❌ Rating failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'validation-error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        error: 'rating-failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// GET - Retrieve video ratings
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const videoId = searchParams.get('videoId')

    if (!videoId) {
      return NextResponse.json(
        { error: 'missing-parameter', message: 'videoId is required' },
        { status: 400 }
      )
    }

    const { data: rating, error } = await supabase
      .from('video_ratings')
      .select('overall_score, dimensions, notes, tags')
      .eq('video_id', videoId)
      .single()

    if (error || !rating) {
      return NextResponse.json(
        { error: 'not-found', message: 'Rating not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(rating)

  } catch (error) {
    console.error('❌ Fetch ratings failed:', error)
    return NextResponse.json(
      { error: 'fetch-failed', message: 'Failed to retrieve ratings' },
      { status: 500 }
    )
  }
}
