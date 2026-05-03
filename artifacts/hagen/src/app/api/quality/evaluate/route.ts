/**
 * Quality Evaluation API
 * 
 * Endpoints for evaluating and monitoring analysis quality over time.
 * Uses LLM-as-judge to compare AI analysis against human baselines.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'
import { 
  evaluateAnalysisQuality, 
  batchEvaluate, 
  computeStatistics,
  type QualityScore 
} from '@/lib/services/video/quality-judge'

export const maxDuration = 120 // 2 minutes for batch operations

interface LearningExample {
  id: string
  video_summary?: string
  correct_interpretation?: string
  explanation?: string
  gemini_interpretation?: string
  humor_type_correction?: {
    original?: string
    correct?: string
    why?: string
    humanInsight?: string
    understanding_score?: number
    score_computed_at?: string
    [key: string]: unknown
  }
  created_at?: string
}

/**
 * POST /api/quality/evaluate
 * 
 * Evaluate a single analysis or batch of analyses against human baselines.
 * 
 * Body:
 *   - single evaluation: { aiAnalysis: object, humanBaseline: string, originalError?: string }
 *   - batch: { evaluations: Array<{ aiAnalysis, humanBaseline, originalError? }> }
 *   - from learning examples: { exampleIds: string[] } - fetches from video_analysis_examples
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Single evaluation
    if (body.aiAnalysis && body.humanBaseline) {
      const score = await evaluateAnalysisQuality(
        body.aiAnalysis,
        body.humanBaseline,
        body.originalError
      )
      
      return NextResponse.json({ 
        success: true, 
        score,
        interpretation: interpretScore(score)
      })
    }
    
    // Batch evaluation
    if (body.evaluations && Array.isArray(body.evaluations)) {
      const scores = await batchEvaluate(body.evaluations)
      const stats = computeStatistics(scores)
      
      return NextResponse.json({ 
        success: true, 
        scores,
        statistics: stats,
        interpretation: interpretBatchStats(stats)
      })
    }
    
    // Evaluate from learning examples
    if (body.exampleIds && Array.isArray(body.exampleIds)) {
      const supabase = supabaseAdmin()
      
      const { data: examples, error } = await supabase
        .from('video_analysis_examples')
        .select('*')
        .in('id', body.exampleIds)
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      
      const typedExamples = examples as unknown as LearningExample[]
      
      const evaluations = typedExamples.map((ex: LearningExample) => ({
        aiAnalysis: {
          // Use the stored gemini interpretation or re-analysis
          humorType: ex.humor_type_correction?.original,
          interpretation: ex.gemini_interpretation
        },
        humanBaseline: buildHumanBaseline(ex),
        originalError: ex.gemini_interpretation
      }))
      
      const scores = await batchEvaluate(evaluations)
      const stats = computeStatistics(scores)
      
      return NextResponse.json({ 
        success: true, 
        examplesEvaluated: examples.length,
        scores,
        statistics: stats,
        interpretation: interpretBatchStats(stats)
      })
    }
    
    return NextResponse.json(
      { error: 'Invalid request body. Provide aiAnalysis+humanBaseline, evaluations array, or exampleIds.' },
      { status: 400 }
    )
    
  } catch (error) {
    console.error('Quality evaluation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/quality/evaluate?limit=N
 * 
 * Get current quality statistics from recent evaluations stored in learning examples.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    
    const supabase = supabaseAdmin()
    
    // Fetch examples that have understanding scores stored
    const { data: examples, error } = await supabase
      .from('video_analysis_examples')
      .select('id, video_summary, humor_type_correction, created_at')
      .not('humor_type_correction', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    const typedExamples = examples as unknown as LearningExample[]
    
    // Extract understanding scores
    const scores = typedExamples
      .filter((ex: LearningExample) => ex.humor_type_correction?.understanding_score !== undefined)
      .map((ex: LearningExample) => ({
        id: ex.id,
        video_summary: ex.video_summary,
        score: ex.humor_type_correction!.understanding_score!,
        scored_at: ex.humor_type_correction!.score_computed_at
      }))
    
    if (scores.length === 0) {
      return NextResponse.json({ 
        message: 'No scored examples found. Run the scoring script first.',
        total_examples: examples.length
      })
    }
    
    const avgScore = scores.reduce((a, s) => a + s.score, 0) / scores.length
    const sorted = [...scores].sort((a, b) => a.score - b.score)
    
    return NextResponse.json({
      total_examples: typedExamples.length,
      scored_count: scores.length,
      statistics: {
        average: Math.round(avgScore * 10) / 10,
        median: sorted[Math.floor(sorted.length / 2)]?.score,
        min: sorted[0]?.score,
        max: sorted[sorted.length - 1]?.score,
        distribution: {
          excellent: scores.filter((s: { score: number }) => s.score >= 90).length,
          good: scores.filter((s: { score: number }) => s.score >= 75 && s.score < 90).length,
          average: scores.filter((s: { score: number }) => s.score >= 50 && s.score < 75).length,
          poor: scores.filter((s: { score: number }) => s.score < 50).length
        }
      },
      recent_scores: scores.slice(0, 10)
    })
    
  } catch (error) {
    console.error('Quality stats error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Helper functions

function buildHumanBaseline(example: LearningExample): string {
  const parts: string[] = []
  
  if (example.correct_interpretation) {
    parts.push(`CORRECT: ${example.correct_interpretation}`)
  }
  if (example.explanation) {
    parts.push(`EXPLANATION: ${example.explanation}`)
  }
  
  const htc = example.humor_type_correction
  if (htc) {
    if (htc.correct) parts.push(`HUMOR TYPE: ${htc.correct}`)
    if (htc.why) parts.push(`WHY: ${htc.why}`)
    if (htc.humanInsight) parts.push(`INSIGHT: ${htc.humanInsight}`)
  }
  
  return parts.join('\n\n')
}

function interpretScore(score: QualityScore): string {
  if (score.overall >= 90) return 'Excellent - Analysis matches human expert level'
  if (score.overall >= 75) return 'Good - Captures main insights with minor gaps'
  if (score.overall >= 50) return 'Acceptable - Gets basics right, could be deeper'
  return 'Poor - Needs review or correction'
}

function interpretBatchStats(stats: ReturnType<typeof computeStatistics>): string {
  const { average, distribution } = stats
  const total = distribution.excellent + distribution.good + distribution.average + distribution.poor
  const goodRate = Math.round((distribution.excellent + distribution.good) / total * 100)
  
  return `${goodRate}% of analyses are good or excellent. Average overall score: ${average.overall}%`
}
