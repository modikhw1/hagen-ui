/**
 * Relationship Inference API
 *
 * POST /api/relationships/infer
 *
 * Uses LLM to infer multi-dimensional relationships between clips.
 * Part of the Relational Matrix system.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { extractStructured } from '@/lib/claude/client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// Request validation schema
const inferRequestSchema = z.object({
  clip_ids: z.array(z.string().uuid()).min(2).max(30),
  focus_dimensions: z.array(z.enum([
    'humor_mechanism',
    'replicability',
    'audience',
    'format',
    'all'
  ])).default(['all']),
  include_notes: z.boolean().default(true),
  threshold: z.number().min(0).max(1).default(0.3)
})

// Output types
interface DimensionScore {
  strength: number
  reasoning: string
  note_anchors: string[]
}

interface RelationshipResult {
  clip_a_id: string
  clip_b_id: string
  dimensions: {
    humor_mechanism?: DimensionScore
    replicability?: DimensionScore
    audience?: DimensionScore
    format?: DimensionScore
  }
  composite_strength: number
  overall_reasoning: string
}

interface InferenceOutput {
  relationships: RelationshipResult[]
  patterns_noticed: string[]
  sparse_dimensions: string[]
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clip_ids, focus_dimensions, include_notes, threshold } = inferRequestSchema.parse(body)

    console.log(`🔗 Inferring relationships for ${clip_ids.length} clips`)

    // 1. Fetch clip data from database
    const { data: clips, error: clipError } = await supabase
      .from('analyzed_videos')
      .select(`
        id,
        video_url,
        video_id,
        platform,
        metadata,
        visual_analysis,
        user_tags,
        user_notes
      `)
      .in('id', clip_ids)

    if (clipError || !clips || clips.length < 2) {
      return NextResponse.json(
        { error: 'insufficient-clips', message: 'Need at least 2 valid clips' },
        { status: 400 }
      )
    }

    // 2. Fetch existing relationship notes if requested
    let notes: Array<{ id: string; clip_a_id: string; clip_b_id: string | null; note_type: string; note_text: string }> = []
    if (include_notes) {
      // Check if table exists, handle gracefully if not
      try {
        const { data: existingNotes } = await supabase
          .from('relationship_notes')
          .select('*')
          .or(`clip_a_id.in.(${clip_ids.join(',')}),clip_b_id.in.(${clip_ids.join(',')})`)

        notes = existingNotes || []
      } catch {
        // Table might not exist yet
        console.log('relationship_notes table not found, proceeding without notes')
      }
    }

    // 3. Build clip summaries for prompt
    const clipSummaries = clips.map(clip => {
      const va = clip.visual_analysis as Record<string, unknown> | null
      const metadata = clip.metadata as Record<string, unknown> | null

      return {
        id: clip.id,
        url: clip.video_url,
        platform: clip.platform,
        author: metadata?.author || 'unknown',

        // Humor analysis (from visual_analysis or extracted)
        humor_mechanism: va?.mechanism || va?.comedyStyle || null,
        humor_summary: va?.prediction_output || va?.summary || null,

        // Audience/format
        target_audience: va?.audience || metadata?.audience || null,
        format_type: va?.format || va?.style || null,

        // Tags and notes
        tags: clip.user_tags || [],
        user_notes: clip.user_notes || null
      }
    })

    // 4. Build notes summary
    const notesSummary = notes.length > 0
      ? notes.map(n => `[${n.note_type}] ${n.clip_a_id?.slice(0, 8)} → ${n.clip_b_id?.slice(0, 8) || 'general'}: ${n.note_text}`).join('\n')
      : 'No existing notes.'

    // 5. Build system prompt for Claude
    const systemPrompt = buildInferencePrompt(focus_dimensions)

    // 6. Build user message with clip data
    const userMessage = `Analyze relationships between these ${clips.length} clips.

## Clips Data
${JSON.stringify(clipSummaries, null, 2)}

## Existing Relationship Notes
${notesSummary}

## Instructions
1. Compare each pair of clips across the requested dimensions
2. For each relationship, provide strength (0.0-1.0) and reasoning
3. Reference specific notes as anchors where relevant
4. Identify any patterns across the clip set
5. Flag dimensions with sparse/low-confidence data

Return ONLY valid JSON matching the required schema.`

    // 7. Call Claude for inference
    const { data: inference, raw } = await extractStructured<InferenceOutput>(
      systemPrompt,
      userMessage,
      { maxTokens: 4096 }
    )

    // 8. Filter relationships below threshold
    const filteredRelationships = (inference.relationships || [])
      .filter(r => r.composite_strength >= threshold)

    console.log(`✅ Inferred ${filteredRelationships.length} relationships above threshold ${threshold}`)

    // 9. Return results
    return NextResponse.json({
      success: true,
      clip_count: clips.length,
      relationship_count: filteredRelationships.length,
      threshold,
      relationships: filteredRelationships,
      patterns_noticed: inference.patterns_noticed || [],
      sparse_dimensions: inference.sparse_dimensions || [],
      raw_response: process.env.NODE_ENV === 'development' ? raw : undefined
    })

  } catch (error) {
    console.error('❌ Relationship inference failed:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'validation-error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        error: 'inference-failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

function buildInferencePrompt(focusDimensions: string[]): string {
  const dimensionDescriptions = {
    humor_mechanism: `
      - Type of humor used (subversion, wordplay, timing, irony, absurdism, etc.)
      - Comedic structure and delivery style
      - Target of the humor (self, situation, audience expectations)`,
    replicability: `
      - Production requirements (people needed, equipment, location)
      - Skill level required for recreation
      - "Evergreen" potential - how adaptable is the format`,
    audience: `
      - Target demographic and sigma_taste level
      - Tone expectations (casual, sophisticated, edgy)
      - Relatability factors`,
    format: `
      - Visual structure and editing style
      - Duration and pacing patterns
      - Platform conventions used`
  }

  const activeDimensions = focusDimensions.includes('all')
    ? Object.keys(dimensionDescriptions)
    : focusDimensions.filter(d => d !== 'all')

  const dimensionInstructions = activeDimensions
    .map(d => `### ${d}\n${dimensionDescriptions[d as keyof typeof dimensionDescriptions]}`)
    .join('\n\n')

  return `You are an expert at analyzing relationships between TikTok video content.
Your task is to infer multi-dimensional relationships between clips based on their characteristics.

## Dimensions to Analyze
${dimensionInstructions}

## Scoring Guidelines
- **0.0-0.3**: Weak or no relationship in this dimension
- **0.3-0.5**: Some similarity but significant differences
- **0.5-0.7**: Notable relationship worth tracking
- **0.7-0.9**: Strong relationship
- **0.9-1.0**: Near-identical in this dimension

## Response Schema
Return a JSON object with this exact structure:
{
  "relationships": [
    {
      "clip_a_id": "uuid",
      "clip_b_id": "uuid",
      "dimensions": {
        "humor_mechanism": {
          "strength": 0.0-1.0,
          "reasoning": "Brief explanation",
          "note_anchors": ["note_id if referenced"]
        }
        // ... other dimensions
      },
      "composite_strength": 0.0-1.0,
      "overall_reasoning": "Overall relationship summary"
    }
  ],
  "patterns_noticed": ["Pattern descriptions found across clips"],
  "sparse_dimensions": ["Dimensions with insufficient data"]
}

## Important
- Be concise in reasoning (1-2 sentences max)
- Only include dimensions you have data for
- composite_strength = weighted average of dimension strengths
- Reference note anchors by ID when they inform your analysis
- Swedish content should be analyzed in the original language context`
}

// GET - Simple info endpoint
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/relationships/infer',
    method: 'POST',
    description: 'Infer multi-dimensional relationships between clips using LLM',
    required_params: {
      clip_ids: 'Array of 2-30 video UUIDs'
    },
    optional_params: {
      focus_dimensions: "['humor_mechanism', 'replicability', 'audience', 'format', 'all']",
      include_notes: 'boolean (default: true)',
      threshold: 'number 0-1 (default: 0.3)'
    }
  })
}
