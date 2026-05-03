/**
 * H1 Training Annotations API
 *
 * POST /api/h1/annotations - Create/update annotation
 * GET /api/h1/annotations - List annotations, get stats, or get random pair
 * DELETE /api/h1/annotations - Delete annotation
 *
 * Flexible schema: supports custom H1 questions, neutral selection
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// Request validation schemas - flexible
const createAnnotationSchema = z.object({
  // H1 identification - either preset type or custom question
  h1_type: z.enum(['quality_ranking', 'humor_similarity', 'replicability_similarity', 'audience_fit', 'custom']).optional(),
  h1_question: z.string().min(5).max(500).optional(),

  // Mode 1: Clip ↔ Clip (requires both clip_a_id and clip_b_id)
  // Mode 2: Brand → Clip (requires clip_a_id and brand_id)
  clip_a_id: z.string().uuid(),
  clip_b_id: z.string().uuid().optional(),
  brand_id: z.string().uuid().optional(),

  // Human annotation - the learning signal
  human_note: z.string().min(5).max(2000),

  // Selection - neutral framing
  selection: z.enum(['clip_a', 'clip_b', 'equal', 'neither']).optional(),

  // Optional reasoning
  selection_reasoning: z.string().optional(),

  // Edge strength (0.0-1.0)
  strength: z.number().min(0).max(1).optional(),

  // Confidence and quality
  confidence: z.number().min(0).max(1).default(0.7),
  annotation_quality: z.enum(['draft', 'silver', 'gold']).default('draft')
}).refine(data => data.h1_type || data.h1_question, {
  message: 'Either h1_type or h1_question must be provided'
}).refine(data => data.clip_b_id || data.brand_id, {
  message: 'Either clip_b_id (clip mode) or brand_id (brand mode) must be provided'
})

const listQuerySchema = z.object({
  action: z.enum(['list', 'stats', 'random_pair']).default('list'),
  h1_type: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  quality: z.enum(['draft', 'silver', 'gold']).optional()
})

// POST - Create or update annotation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createAnnotationSchema.parse(body)

    // Determine mode: clip-to-clip or brand-to-clip
    const isBrandMode = !!data.brand_id && !data.clip_b_id

    let clipA = data.clip_a_id
    let clipB = data.clip_b_id || null
    let selection = data.selection

    // Only do clip ordering in clip-to-clip mode
    if (!isBrandMode && clipB && clipA > clipB) {
      // Swap clips and flip selection
      ;[clipA, clipB] = [clipB, clipA]
      if (selection === 'clip_a') selection = 'clip_b'
      else if (selection === 'clip_b') selection = 'clip_a'
    }

    // Determine h1_type
    const h1Type = data.h1_question ? 'custom' : data.h1_type

    const insertData: Record<string, unknown> = {
      h1_type: h1Type,
      h1_question: data.h1_question || null,
      clip_a_id: clipA,
      clip_b_id: clipB,
      human_note: data.human_note,
      winner: selection || null,
      winner_reasoning: data.selection_reasoning || null,
      strength: data.strength || null,
      confidence: data.confidence,
      annotation_quality: data.annotation_quality
    }

    // Add brand_id for brand mode
    if (isBrandMode) {
      insertData.brand_id = data.brand_id
    }

    const { data: result, error } = await supabase
      .from('h1_training_pairs')
      .insert(insertData)
      .select('id')
      .single()

    if (error) {
      console.error('Failed to save annotation:', error)
      return NextResponse.json(
        { error: 'save-failed', message: error.message },
        { status: 500 }
      )
    }

    const modeLabel = isBrandMode ? 'brand' : 'clip'
    console.log(`Saved H1 annotation: ${h1Type} (${modeLabel} mode, ${selection || 'no selection'})`)

    return NextResponse.json({
      success: true,
      id: result.id,
      h1_type: h1Type,
      h1_question: data.h1_question,
      selection,
      mode: modeLabel
    })

  } catch (error) {
    console.error('Annotation save failed:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'validation-error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'save-failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET - List annotations, get stats, or get random pair
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const params = listQuerySchema.parse(Object.fromEntries(searchParams))

    // Action: stats
    if (params.action === 'stats') {
      const { data: annotations, error } = await supabase
        .from('h1_training_pairs')
        .select('h1_type, h1_question, annotation_quality')

      if (error) {
        return NextResponse.json({ stats: [], total: 0 })
      }

      // Group by h1_type/question
      const byType: Record<string, { total: number; gold: number; silver: number; draft: number }> = {}

      for (const row of annotations || []) {
        const key = row.h1_question || row.h1_type || 'unknown'
        if (!byType[key]) {
          byType[key] = { total: 0, gold: 0, silver: 0, draft: 0 }
        }
        byType[key].total++
        byType[key][row.annotation_quality as 'gold' | 'silver' | 'draft']++
      }

      return NextResponse.json({
        total: annotations?.length || 0,
        by_h1: byType
      })
    }

    // Action: random_pair
    if (params.action === 'random_pair') {
      // Get two random clips with visual_analysis
      const { data: clips, error: clipsError } = await supabase
        .from('analyzed_videos')
        .select('id, video_id, video_url, platform, visual_analysis, metadata')
        .not('visual_analysis', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)

      if (clipsError || !clips || clips.length < 2) {
        return NextResponse.json(
          { error: 'no-clips', message: 'Not enough analyzed clips available' },
          { status: 404 }
        )
      }

      // Pick two random clips
      const shuffled = clips.sort(() => Math.random() - 0.5)
      const [clipA, clipB] = shuffled.slice(0, 2)

      return NextResponse.json({
        clip_a: formatClipData(clipA),
        clip_b: formatClipData(clipB)
      })
    }

    // Action: list (default)
    let query = supabase
      .from('h1_training_pairs')
      .select(`
        id,
        h1_type,
        h1_question,
        clip_a_id,
        clip_b_id,
        human_note,
        winner,
        winner_reasoning,
        strength,
        confidence,
        annotation_quality,
        created_at
      `)
      .order('created_at', { ascending: false })
      .range(params.offset, params.offset + params.limit - 1)

    if (params.h1_type) {
      query = query.eq('h1_type', params.h1_type)
    }

    if (params.quality) {
      query = query.eq('annotation_quality', params.quality)
    }

    const { data: annotations, error } = await query

    if (error) {
      return NextResponse.json({
        annotations: [],
        count: 0
      })
    }

    return NextResponse.json({
      annotations: annotations || [],
      count: annotations?.length || 0,
      offset: params.offset,
      limit: params.limit
    })

  } catch (error) {
    console.error('Annotation list failed:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'validation-error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'list-failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE - Remove annotation
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'missing-id', message: 'Annotation ID required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('h1_training_pairs')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Failed to delete annotation:', error)
      return NextResponse.json(
        { error: 'delete-failed', message: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, deleted: id })

  } catch (error) {
    console.error('Annotation delete failed:', error)
    return NextResponse.json(
      { error: 'delete-failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Helper: Format clip data for UI - show key variables
function formatClipData(clip: any) {
  if (!clip) return null

  const va = clip.visual_analysis as Record<string, any> | null
  const signals = va?.schema_v1_signals || {}

  return {
    id: clip.id,
    video_id: clip.video_id,
    video_url: clip.video_url,
    platform: clip.platform,

    // Key summary fields for quick comparison
    summary: {
      concept: va?.script?.conceptCore || null,
      humor_type: va?.script?.humor?.humorType || null,
      target_audience: va?.content?.targetAudience || signals?.target_audience?.lifestyle_tags || null,
      replicability_score: va?.script?.replicability?.score || null,
      style: va?.content?.style || null,
    },

    // Full analysis for deep inspection
    visual_analysis: va
  }
}
