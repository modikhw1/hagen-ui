/**
 * Prepare Profile API - Backfills missing data for fingerprint computation
 *
 * POST /api/brand-analysis/prepare-profile
 *
 * Given a list of video URLs (from the fingerprint computation), this endpoint:
 * 1. Backfills embeddings for videos that are missing them
 * 2. Runs Schema v1 analysis for videos that don't have it
 *
 * Body:
 * {
 *   "video_urls": string[]  // URLs of videos already in the system
 * }
 *
 * Returns:
 * {
 *   "success": true,
 *   "embeddings_backfilled": number,
 *   "schema_v1_analyzed": number,
 *   "errors": string[]
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { getBrandAnalyzer } from '@/lib/services/brand'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Rate limiter
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float'
  })
  return response.data[0].embedding
}

function buildEmbeddingText(
  video: { metadata?: { title?: string; description?: string; author?: { displayName?: string } }; visual_analysis?: { deep_analysis?: { script?: { summary?: string; humor?: { humorMechanism?: string } } } } },
  rating?: { notes?: string }
): string {
  const parts: string[] = []

  // Metadata
  if (video.metadata) {
    if (video.metadata.title) parts.push(`Title: ${video.metadata.title}`)
    if (video.metadata.description) parts.push(`Description: ${video.metadata.description}`)
    if (video.metadata.author?.displayName) parts.push(`Author: ${video.metadata.author.displayName}`)
  }

  // Visual analysis summary
  const deepAnalysis = video.visual_analysis?.deep_analysis
  if (deepAnalysis?.script?.summary) {
    parts.push(`Summary: ${deepAnalysis.script.summary}`)
  }
  if (deepAnalysis?.script?.humor?.humorMechanism) {
    parts.push(`Humor: ${deepAnalysis.script.humor.humorMechanism}`)
  }

  // Human notes (most important!)
  if (rating?.notes) {
    parts.push(`Expert Notes: ${rating.notes}`)
  }

  return parts.join('\n')
}

function extractVideoId(url: string): string | null {
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) return ytMatch[1]

  const ttMatch = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/)
  if (ttMatch) return ttMatch[1]

  const ttShort = url.match(/vm\.tiktok\.com\/([a-zA-Z0-9]+)/)
  if (ttShort) return ttShort[1]

  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const videoUrls: string[] = body?.video_urls || []

    if (!videoUrls.length) {
      return NextResponse.json({ error: 'No video_urls provided' }, { status: 400 })
    }

    // Fetch videos from database using exact URL match (same as fingerprint service)
    const { data: videos, error: videosError } = await supabase
      .from('analyzed_videos')
      .select('id, video_url, video_id, metadata, visual_analysis, content_embedding, gcs_uri')
      .in('video_url', videoUrls)

    if (videosError) throw videosError

    const foundVideos = videos || []
    
    console.log(`[prepare-profile] Found ${foundVideos.length} videos from ${videoUrls.length} URLs`)
    console.log(`[prepare-profile] Videos needing embedding: ${foundVideos.filter(v => !v.content_embedding).length}`)
    console.log(`[prepare-profile] Videos with GCS URI: ${foundVideos.filter(v => v.gcs_uri).length}`)
    
    const errors: string[] = []
    let embeddingsBackfilled = 0
    let schemaV1Analyzed = 0

    // Get video IDs for rating/brand_rating lookups
    const dbVideoIds = foundVideos.map((v) => v.id)

    // Fetch existing ratings
    const { data: ratings } = await supabase
      .from('video_ratings')
      .select('video_id, notes, overall_score')
      .in('video_id', dbVideoIds)

    const ratingsMap = new Map(ratings?.map((r) => [r.video_id, r]) || [])

    // Fetch existing Schema v1 ratings (old flow: rater_id='schema_v1')
    const { data: brandRatings } = await supabase
      .from('video_brand_ratings')
      .select('video_id, rater_id, extracted_signals')
      .in('video_id', dbVideoIds)

    // A video has brand signals if it has EITHER:
    // 1. rater_id='schema_v1' entry (old flow)
    // 2. rater_id='primary' entry WITH v1.1 JSONB columns filled (new analyze-rate-v1 flow)
    const hasSchemaV1 = new Set(
      brandRatings?.filter((r) => 
        r.rater_id === 'schema_v1' || 
        (r.rater_id === 'primary' && r.extracted_signals)
      ).map((r) => r.video_id) || []
    )

    // ---------------------------------------------------------------------
    // Step 1: Backfill embeddings for videos missing them
    // ---------------------------------------------------------------------
    const videosNeedingEmbedding = foundVideos.filter((v) => !v.content_embedding)

    for (const video of videosNeedingEmbedding) {
      try {
        const rating = ratingsMap.get(video.id)
        const text = buildEmbeddingText(video, rating)

        if (text.length < 20) {
          errors.push(`Skipped embedding for ${video.video_id}: insufficient text`)
          continue
        }

        const embedding = await generateEmbedding(text)

        const { error: updateError } = await supabase
          .from('analyzed_videos')
          .update({ content_embedding: embedding })
          .eq('id', video.id)

        if (updateError) {
          errors.push(`Failed to save embedding for ${video.video_id}: ${updateError.message}`)
        } else {
          embeddingsBackfilled++
        }

        await delay(200) // Rate limit
      } catch (err) {
        errors.push(`Embedding error for ${video.video_id}: ${err instanceof Error ? err.message : 'Unknown'}`)
      }
    }

    // ---------------------------------------------------------------------
    // Step 2: Run Schema v1 analysis for videos missing it (that have gcs_uri)
    // ---------------------------------------------------------------------
    const videosNeedingSchemaV1 = foundVideos.filter(
      (v) => !hasSchemaV1.has(v.id) && v.gcs_uri
    )

    if (videosNeedingSchemaV1.length > 0) {
      try {
        const analyzer = await getBrandAnalyzer()

        for (const video of videosNeedingSchemaV1) {
          try {
            // Get current human ratings if any
            const { data: existingRating } = await supabase
              .from('video_brand_ratings')
              .select('*')
              .eq('video_id', video.id)
              .eq('rater_id', 'primary')
              .single()

            // Run Vertex analysis
            const analysis = await analyzer.analyze({
              videoId: video.video_id || video.id,
              videoUrl: video.video_url,
              gcsUri: video.gcs_uri!
            })

            // Store result
            const aiAnalysis = {
              kind: 'schema_v1_review',
              model_analysis: analysis,
              human_patch: existingRating?.ai_analysis?.human_patch || null,
              merged: analysis,
              timestamp: new Date().toISOString()
            }

            const { error: upsertError } = await supabase
              .from('video_brand_ratings')
              .upsert(
                {
                  video_id: video.id,
                  rater_id: 'schema_v1',
                  ai_analysis: aiAnalysis,
                  updated_at: new Date().toISOString()
                },
                { onConflict: 'video_id,rater_id' }
              )

            if (upsertError) {
              errors.push(`Failed to save Schema v1 for ${video.video_id}: ${upsertError.message}`)
            } else {
              schemaV1Analyzed++
            }

            await delay(1000) // Vertex rate limit
          } catch (err) {
            errors.push(`Schema v1 error for ${video.video_id}: ${err instanceof Error ? err.message : 'Unknown'}`)
          }
        }
      } catch (err) {
        errors.push(`Failed to initialize analyzer: ${err instanceof Error ? err.message : 'Unknown'}`)
      }
    }

    // Videos that need Schema v1 but don't have gcs_uri
    const needGcsUri = foundVideos.filter(
      (v) => !hasSchemaV1.has(v.id) && !v.gcs_uri
    )
    if (needGcsUri.length > 0) {
      errors.push(`${needGcsUri.length} video(s) need GCS upload before Schema v1 can run`)
    }

    return NextResponse.json({
      success: true,
      embeddings_backfilled: embeddingsBackfilled,
      schema_v1_analyzed: schemaV1Analyzed,
      videos_found: foundVideos.length,
      videos_checked_for_embedding: videosNeedingEmbedding.length,
      videos_checked_for_schema_v1: videosNeedingSchemaV1.length,
      videos_needing_gcs: needGcsUri.length,
      errors
    })
  } catch (err) {
    console.error('Prepare profile error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
