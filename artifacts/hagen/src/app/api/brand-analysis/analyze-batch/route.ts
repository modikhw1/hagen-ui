/**
 * Brand Analysis (Schema v1) - Batch analyzer
 *
 * POST /api/brand-analysis/analyze-batch
 *
 * Runs Schema v1 analysis for videos that already have gcs_uri, in small batches.
 * Stores results into video_brand_ratings under rater_id = 'schema_v1' by default.
 * (This is intentionally separate from rater_id = 'primary' to avoid overwriting human ratings.)
 *
 * Body:
 * {
 *   "limit"?: number (default 5, max 20)
 *   "only_missing"?: boolean (default true)
 *   "rater_id"?: string (default "schema_v1")
 * }
 *
 * Optional protection:
 * If BATCH_API_KEY is set, send header: x-batch-key: <value>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getBrandAnalyzer } from '@/lib/services/brand'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function clampLimit(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 5
  return Math.max(1, Math.min(20, Math.floor(n)))
}

export async function POST(request: NextRequest) {
  try {
    const batchKey = process.env.BATCH_API_KEY
    if (batchKey) {
      const provided = request.headers.get('x-batch-key')
      if (provided !== batchKey) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json().catch(() => ({}))
    const limit = clampLimit(body?.limit)
    const onlyMissing = body?.only_missing !== false
    const raterId = (body?.rater_id as string) || 'schema_v1'

    // Pull a pool of candidate videos with gcs_uri.
    const poolSize = 200
    const { data: videos, error: videosError } = await supabase
      .from('analyzed_videos')
      .select('id, video_url, platform, gcs_uri, created_at')
      .not('gcs_uri', 'is', null)
      .order('created_at', { ascending: false })
      .limit(poolSize)

    if (videosError) throw videosError

    const candidates = (videos || []).filter((v) => v.gcs_uri)
    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        processed_count: 0,
        message: 'No videos with gcs_uri found.'
      })
    }

    let toProcess = candidates

    if (onlyMissing) {
      const ids = candidates.map((v) => v.id)
      const { data: existing, error: existingError } = await supabase
        .from('video_brand_ratings')
        .select('video_id')
        .in('video_id', ids)
        .eq('rater_id', raterId)

      if (existingError) throw existingError

      const existingSet = new Set((existing || []).map((r: any) => r.video_id))
      toProcess = candidates.filter((v) => !existingSet.has(v.id))
    }

    const batch = toProcess.slice(0, limit)

    if (batch.length === 0) {
      return NextResponse.json({
        success: true,
        processed_count: 0,
        message: onlyMissing ? 'No missing videos to process.' : 'No videos to process.'
      })
    }

    const analyzer = getBrandAnalyzer()

    const processed: Array<{ video_id: string; ok: boolean; error?: string }> = []

    for (const v of batch) {
      try {
        const analysis = await analyzer.analyze({
          videoId: v.id,
          videoUrl: v.video_url || undefined,
          gcsUri: v.gcs_uri || undefined
        })

        const aiAnalysis = {
          kind: 'schema_v1_review',
          model_analysis: analysis,
          human_patch: null,
          updated_at: new Date().toISOString()
        }

        const { error: upsertError } = await supabase
          .from('video_brand_ratings')
          .upsert(
            {
              video_id: v.id,
              rater_id: raterId,
              personality_notes: '',
              statement_notes: '',
              ai_analysis: aiAnalysis,
              extracted_signals: analysis.signals || null,
              corrections: null
            },
            { onConflict: 'video_id,rater_id' }
          )

        if (upsertError) throw upsertError

        processed.push({ video_id: v.id, ok: true })
      } catch (err) {
        processed.push({
          video_id: v.id,
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({
      success: true,
      processed_count: processed.filter((p) => p.ok).length,
      attempted_count: processed.length,
      rater_id: raterId,
      only_missing: onlyMissing,
      results: processed
    })
  } catch (error) {
    console.error('POST brand-analysis/analyze-batch error:', error)
    return NextResponse.json(
      {
        error: 'Failed to batch analyze videos',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
