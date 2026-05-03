/**
 * Analysis Quality Service
 * 
 * Uses LLM-as-judge to evaluate analysis quality and track improvement over time.
 * Integrated into the production pipeline for ongoing quality monitoring.
 */

import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// =============================================================================
// TYPES
// =============================================================================

export interface QualityScore {
  mechanism_match: number      // 0-100: Does analysis identify correct humor mechanism?
  key_insight_captured: number // 0-100: Does it capture the human's main insight?
  error_avoided: number        // 0-100: Does it avoid previous errors?
  depth_of_analysis: number    // 0-100: How deep/nuanced is the analysis?
  overall: number              // 0-100: Overall alignment with human understanding
  explanation: string          // Brief explanation of the score
}

export interface QualityEvaluation {
  video_id: string
  scores: QualityScore
  human_baseline?: string      // Human correction/insight if available
  ai_analysis: unknown         // The AI analysis being evaluated
  evaluated_at: string
}

// =============================================================================
// JUDGE PROMPT
// =============================================================================

const JUDGE_PROMPT = `You are evaluating whether an AI's humor analysis captures the same insights as a human expert.

HUMAN EXPERT ANALYSIS:
{human}

AI ANALYSIS TO EVALUATE:
{ai}

{original_error_section}

Evaluate on these criteria (0-100 each):

1. MECHANISM MATCH: Does the AI identify the same core humor mechanism as the human?
   - 100 = Exact same mechanism identified
   - 50 = Related but different mechanism
   - 0 = Completely different/wrong mechanism

2. KEY INSIGHT CAPTURED: Does the AI capture the human's main insight about WHY this is funny?
   This includes:
   - Social dynamics (if someone is embarrassed, rejected, put down - did AI name it?)
   - Power dynamics (who has power, who doesn't)
   - Quality assessment (if human said "weak premise", did AI recognize this?)
   
   - 100 = Captures the exact insight including social/power dynamics
   - 50 = Partially captures it, misses important nuance
   - 0 = Misses it entirely

3. ERROR AVOIDED: Does the AI avoid any original mistakes?
   - 100 = Shows deeper understanding than surface-level labeling
   - 50 = Partially improved
   - 0 = Still surface-level

4. DEPTH OF ANALYSIS: How well does the AI explain the underlying dynamics?
   Look for: specific naming of social dynamics, acknowledgment of quality issues,
   recognition of mean humor vs light humor, escalation patterns, etc.
   - 100 = Deep, nuanced analysis matching human depth
   - 50 = Surface-level but correct
   - 0 = Shallow or incorrect

Respond with JSON only:
{
  "mechanism_match": <0-100>,
  "key_insight_captured": <0-100>,
  "error_avoided": <0-100>,
  "depth_of_analysis": <0-100>,
  "overall_score": <0-100>,
  "brief_explanation": "One sentence explaining the score"
}`

// =============================================================================
// QUALITY EVALUATION FUNCTIONS
// =============================================================================

/**
 * Evaluate an AI analysis against a human baseline
 */
export async function evaluateAnalysisQuality(
  aiAnalysis: unknown,
  humanBaseline: string,
  originalError?: string
): Promise<QualityScore> {
  const originalErrorSection = originalError 
    ? `ORIGINAL AI ERROR (what was missed before):\n${originalError}` 
    : ''
  
  const prompt = JUDGE_PROMPT
    .replace('{human}', humanBaseline)
    .replace('{ai}', JSON.stringify(aiAnalysis, null, 2))
    .replace('{original_error_section}', originalErrorSection)
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
    
    const result = JSON.parse(response.choices[0].message.content || '{}')
    
    return {
      mechanism_match: result.mechanism_match || 0,
      key_insight_captured: result.key_insight_captured || 0,
      error_avoided: result.error_avoided || 0,
      depth_of_analysis: result.depth_of_analysis || 0,
      overall: result.overall_score || 0,
      explanation: result.brief_explanation || 'No explanation provided'
    }
  } catch (error) {
    console.error('Error evaluating analysis quality:', error)
    return {
      mechanism_match: 0,
      key_insight_captured: 0,
      error_avoided: 0,
      depth_of_analysis: 0,
      overall: 0,
      explanation: 'Evaluation failed'
    }
  }
}

/**
 * Quick quality check - returns overall score only (faster/cheaper)
 */
export async function quickQualityCheck(
  aiAnalysis: unknown,
  humanBaseline: string
): Promise<number> {
  const scores = await evaluateAnalysisQuality(aiAnalysis, humanBaseline)
  return scores.overall
}

/**
 * Batch evaluate multiple analyses
 */
export async function batchEvaluate(
  evaluations: Array<{
    aiAnalysis: unknown
    humanBaseline: string
    originalError?: string
  }>
): Promise<QualityScore[]> {
  const results: QualityScore[] = []
  
  for (const evaluation of evaluations) {
    const score = await evaluateAnalysisQuality(
      evaluation.aiAnalysis,
      evaluation.humanBaseline,
      evaluation.originalError
    )
    results.push(score)
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 100))
  }
  
  return results
}

/**
 * Compute aggregate statistics from multiple scores
 */
export function computeStatistics(scores: QualityScore[]): {
  average: QualityScore
  median: number
  distribution: { excellent: number; good: number; average: number; poor: number }
} {
  if (scores.length === 0) {
    return {
      average: {
        mechanism_match: 0,
        key_insight_captured: 0,
        error_avoided: 0,
        depth_of_analysis: 0,
        overall: 0,
        explanation: 'No scores to compute'
      },
      median: 0,
      distribution: { excellent: 0, good: 0, average: 0, poor: 0 }
    }
  }
  
  const avg = (key: keyof Omit<QualityScore, 'explanation'>) =>
    Math.round(scores.reduce((a, s) => a + s[key], 0) / scores.length * 10) / 10
  
  const sorted = [...scores.map(s => s.overall)].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  
  return {
    average: {
      mechanism_match: avg('mechanism_match'),
      key_insight_captured: avg('key_insight_captured'),
      error_avoided: avg('error_avoided'),
      depth_of_analysis: avg('depth_of_analysis'),
      overall: avg('overall'),
      explanation: `Average of ${scores.length} evaluations`
    },
    median,
    distribution: {
      excellent: scores.filter(s => s.overall >= 90).length,
      good: scores.filter(s => s.overall >= 75 && s.overall < 90).length,
      average: scores.filter(s => s.overall >= 50 && s.overall < 75).length,
      poor: scores.filter(s => s.overall < 50).length
    }
  }
}

// =============================================================================
// QUALITY THRESHOLDS
// =============================================================================

export const QUALITY_THRESHOLDS = {
  EXCELLENT: 90,  // Analysis matches human expert level
  GOOD: 75,       // Captures main insights with minor gaps
  ACCEPTABLE: 50, // Gets the basics right
  POOR: 50        // Below this needs review/correction
}

/**
 * Check if analysis meets quality threshold
 */
export function meetsQualityThreshold(
  score: QualityScore, 
  threshold: keyof typeof QUALITY_THRESHOLDS = 'ACCEPTABLE'
): boolean {
  return score.overall >= QUALITY_THRESHOLDS[threshold]
}
