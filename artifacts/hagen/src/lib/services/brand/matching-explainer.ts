/**
 * Match Explanation Generator
 * 
 * Creates human-readable explanations for why a video matches (or doesn't match) a brand.
 */

import type {
  VideoFingerprint,
  BrandFingerprint,
  HardFilterResult,
  SoftScoreComponent,
  EnhancedMatchResult
} from './profile-fingerprint.types'
import { runHardFilterPipeline, getFilterFailureSummary } from './matching-filters'
import { runSoftScoringPipeline, getMatchSummary } from './matching-scoring'

// =============================================================================
// EXPLANATION GENERATION
// =============================================================================

/**
 * Generate a concise, human-readable explanation of the match
 */
export function generateMatchExplanation(
  video: VideoFingerprint,
  brand: BrandFingerprint,
  scores: SoftScoreComponent[],
  passedFilters: boolean
): string {
  if (!passedFilters) {
    return 'This video does not meet basic requirements for your brand.'
  }

  const parts: string[] = []

  // Find top 2 scoring components
  const sortedScores = [...scores].sort((a, b) => b.score - a.score)
  const topScores = sortedScores.slice(0, 2)

  // Audience description
  const audienceScore = scores.find(s => s.name === 'audience_alignment')
  if (audienceScore && audienceScore.score >= 0.7) {
    const audience = video.audience_signals
    if (audience.age_primary) {
      const ageLabels: Record<string, string> = {
        'gen_z': 'Gen Z',
        'millennial': 'millennials',
        'gen_x': 'Gen X',
        'boomer': 'mature audiences',
        'broad': 'a broad audience'
      }
      parts.push(`targets ${ageLabels[audience.age_primary] || audience.age_primary}`)
    }
    if (audience.lifestyle_tags.length > 0) {
      parts.push(`appeals to ${audience.lifestyle_tags.slice(0, 2).join(' and ')}`)
    }
  }

  // Tone description
  const toneScore = scores.find(s => s.name === 'tone_match')
  if (toneScore && toneScore.score >= 0.7) {
    const tone = video.tone_profile
    const toneDescriptors: string[] = []
    
    if (tone.humor_present) {
      toneDescriptors.push('playful')
    }
    if (tone.energy !== null) {
      if (tone.energy >= 7) toneDescriptors.push('high-energy')
      else if (tone.energy <= 4) toneDescriptors.push('calm')
    }
    if (tone.warmth !== null && tone.warmth >= 7) {
      toneDescriptors.push('warm')
    }
    
    if (toneDescriptors.length > 0) {
      parts.push(`with ${toneDescriptors.join(', ')} tone`)
    }
  }

  // Format description
  const format = video.format
  if (format.primary_intent) {
    const intentLabels: Record<string, string> = {
      'entertain': 'entertainment-focused',
      'inspire': 'inspirational',
      'inform': 'educational',
      'sell': 'promotional',
      'connect': 'community-building'
    }
    if (intentLabels[format.primary_intent]) {
      parts.push(`${intentLabels[format.primary_intent]} content`)
    }
  }

  // Replicability note
  const rep = video.replicability
  if (rep.actor_count === 'solo' && rep.setup_complexity === 'phone_only') {
    parts.push('easy to recreate')
  } else if (rep.feasibility_score >= 0.7) {
    parts.push('replicable for your team')
  }

  // Construct final sentence
  if (parts.length === 0) {
    return 'This video shows potential alignment with your brand profile.'
  }

  const mainPart = parts.slice(0, 3).join(', ')
  return `This ${mainPart}.`
}

/**
 * Generate detailed breakdown for UI tooltip or expanded view
 */
export function generateDetailedBreakdown(
  scores: SoftScoreComponent[],
  filterResults: HardFilterResult[]
): string[] {
  const lines: string[] = []

  // Filter status
  const allPassed = filterResults.every(f => f.passed)
  if (allPassed) {
    lines.push('✓ Passes all compatibility checks')
  } else {
    const failed = filterResults.filter(f => !f.passed)
    failed.forEach(f => {
      lines.push(`✗ ${f.reason}`)
    })
    return lines // Don't show scores if filters failed
  }

  // Score breakdown
  lines.push('')
  lines.push('Score Breakdown:')
  scores.forEach(s => {
    const pct = Math.round(s.score * 100)
    const bar = '█'.repeat(Math.round(s.score * 8)) + '░'.repeat(8 - Math.round(s.score * 8))
    const label = s.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    lines.push(`  ${bar} ${pct}% ${label}`)
    if (s.explanation) {
      lines.push(`    ${s.explanation}`)
    }
  })

  return lines
}

// =============================================================================
// MAIN MATCHING FUNCTION
// =============================================================================

/**
 * Compute full enhanced match result between a video and brand
 */
export function computeEnhancedMatch(
  video: VideoFingerprint,
  brand: BrandFingerprint
): EnhancedMatchResult {
  // Run hard filters first
  const { passed: passesFilters, results: filterResults } = runHardFilterPipeline(video, brand)

  // If filters fail, return early with zero score
  if (!passesFilters) {
    return {
      video_id: video.video_id,
      brand_id: brand.brand_id,
      passes_filters: false,
      filter_results: filterResults,
      soft_scores: [],
      overall_score: 0,
      explanation: getFilterFailureSummary(filterResults),
      match_summary: {
        audience_fit: 0,
        tone_match: 0,
        format_fit: 0,
        aspiration_alignment: 0
      }
    }
  }

  // Run soft scoring
  const { scores, overall } = runSoftScoringPipeline(video, brand)

  // Generate explanation
  const explanation = generateMatchExplanation(video, brand, scores, true)

  return {
    video_id: video.video_id,
    brand_id: brand.brand_id,
    passes_filters: true,
    filter_results: filterResults,
    soft_scores: scores,
    overall_score: overall,
    explanation,
    match_summary: getMatchSummary(scores)
  }
}

/**
 * Batch compute matches for multiple videos against a brand
 * Returns sorted by overall score descending
 */
export function computeBatchMatches(
  videos: VideoFingerprint[],
  brand: BrandFingerprint,
  options?: {
    includeFiltered?: boolean;  // Include videos that failed filters (default: false)
    maxResults?: number;        // Limit results (default: all)
  }
): EnhancedMatchResult[] {
  const results = videos.map(v => computeEnhancedMatch(v, brand))

  // Filter out failed unless requested
  let filtered = options?.includeFiltered
    ? results
    : results.filter(r => r.passes_filters)

  // Sort by score descending
  filtered.sort((a, b) => b.overall_score - a.overall_score)

  // Limit if requested
  if (options?.maxResults && filtered.length > options.maxResults) {
    filtered = filtered.slice(0, options.maxResults)
  }

  return filtered
}
