/**
 * Soft Scoring Pipeline for Video-Brand Matching
 * 
 * After hard filters pass, soft scoring determines how well a video matches.
 * New weights based on diagnostic insights:
 * - Audience Alignment: 35% (THE differentiator)
 * - Tone/Personality: 30% (humor-forward for TikTok)
 * - Format Appropriateness: 20%
 * - Aspiration Alignment: 15%
 */

import type {
  VideoFingerprint,
  BrandFingerprint,
  SoftScoreComponent,
  AudienceSignals,
  TargetAudienceDefinition,
  ToneProfile,
  TonePreferences,
  ContentFormat,
  AmbitionLevel
} from './profile-fingerprint.types'

// =============================================================================
// CONSTANTS
// =============================================================================

const WEIGHTS = {
  AUDIENCE: 0.35,
  TONE: 0.30,
  FORMAT: 0.20,
  ASPIRATION: 0.15
}

// =============================================================================
// AUDIENCE ALIGNMENT (35%)
// =============================================================================

/**
 * Score how well the video's audience signals match the brand's target audience
 */
export function scoreAudienceAlignment(
  videoAudience: AudienceSignals,
  brandTarget: TargetAudienceDefinition
): SoftScoreComponent {
  let score = 0
  let maxScore = 0
  const reasons: string[] = []

  // Age alignment (0.3 weight)
  maxScore += 0.3
  if (videoAudience.age_primary && brandTarget.age_primary) {
    if (videoAudience.age_primary === brandTarget.age_primary) {
      score += 0.3
      reasons.push(`Age match: ${brandTarget.age_primary}`)
    } else if (videoAudience.age_primary === 'broad' || brandTarget.age_primary === 'broad') {
      score += 0.2
      reasons.push('Broad age appeal')
    } else {
      // Check if within one generation
      const ageOrder = ['gen_z', 'millennial', 'gen_x', 'boomer']
      const diff = Math.abs(ageOrder.indexOf(videoAudience.age_primary) - ageOrder.indexOf(brandTarget.age_primary))
      if (diff === 1) {
        score += 0.15
        reasons.push('Adjacent age group')
      }
    }
  } else {
    score += 0.15 // Neutral if unknown
  }

  // Income level alignment (0.2 weight)
  maxScore += 0.2
  if (videoAudience.income_level && brandTarget.income_level) {
    if (videoAudience.income_level === brandTarget.income_level) {
      score += 0.2
      reasons.push(`Income match: ${brandTarget.income_level}`)
    } else if (videoAudience.income_level === 'broad' || brandTarget.income_level === 'broad') {
      score += 0.15
    } else {
      const incomeOrder = ['budget', 'mid_range', 'upscale', 'luxury']
      const diff = Math.abs(incomeOrder.indexOf(videoAudience.income_level) - incomeOrder.indexOf(brandTarget.income_level))
      if (diff === 1) score += 0.1
    }
  } else {
    score += 0.1
  }

  // Lifestyle tags overlap (0.25 weight)
  maxScore += 0.25
  if (videoAudience.lifestyle_tags.length > 0 && brandTarget.lifestyle_tags.length > 0) {
    const overlap = videoAudience.lifestyle_tags.filter(t => brandTarget.lifestyle_tags.includes(t))
    const overlapRatio = overlap.length / Math.max(brandTarget.lifestyle_tags.length, 1)
    score += 0.25 * overlapRatio
    if (overlap.length > 0) {
      reasons.push(`Lifestyle: ${overlap.join(', ')}`)
    }
  } else {
    score += 0.1 // Neutral
  }

  // Occasion match (0.15 weight)
  maxScore += 0.15
  if (videoAudience.primary_occasion && brandTarget.primary_occasion) {
    if (videoAudience.primary_occasion === brandTarget.primary_occasion) {
      score += 0.15
      reasons.push(`Occasion: ${brandTarget.primary_occasion}`)
    } else {
      score += 0.05 // Partial credit
    }
  } else {
    score += 0.075
  }

  // Vibe alignment (0.1 weight)
  maxScore += 0.1
  if (videoAudience.vibe_alignment && brandTarget.vibe) {
    if (videoAudience.vibe_alignment === brandTarget.vibe) {
      score += 0.1
      reasons.push(`Vibe: ${brandTarget.vibe}`)
    } else {
      score += 0.03
    }
  } else {
    score += 0.05
  }

  const normalizedScore = maxScore > 0 ? score / maxScore : 0.5

  return {
    name: 'audience_alignment',
    score: normalizedScore,
    weight: WEIGHTS.AUDIENCE,
    explanation: reasons.length > 0 ? reasons.join('; ') : 'Limited audience data'
  }
}

// =============================================================================
// TONE/PERSONALITY MATCH (30%)
// =============================================================================

/**
 * Score how well the video's tone matches the brand's preferences
 * Includes humor bias for TikTok service
 */
export function scoreToneMatch(
  videoTone: ToneProfile,
  brandPrefs: TonePreferences
): SoftScoreComponent {
  let score = 0
  const reasons: string[] = []

  // Humor alignment (weighted heavily for TikTok)
  const humorWeight = 0.35
  if (videoTone.humor_present) {
    // Brand wants humor
    if (brandPrefs.humor_level !== 'none') {
      score += humorWeight
      reasons.push('Humor present (brand-aligned)')
    } else {
      // Brand wants no humor but video has it - penalty
      score += humorWeight * 0.3
      reasons.push('Humor present but brand prefers none')
    }
  } else {
    // No humor in video
    if (brandPrefs.humor_level === 'none') {
      score += humorWeight
      reasons.push('No humor (brand-aligned)')
    } else {
      score += humorWeight * 0.5
      reasons.push('No humor but brand prefers some')
    }
  }

  // Energy match (0.25 weight)
  const energyWeight = 0.25
  if (videoTone.energy !== null) {
    const energyMap: Record<string, [number, number]> = {
      'calm': [1, 4],
      'moderate': [4, 7],
      'high': [7, 10]
    }
    const [min, max] = energyMap[brandPrefs.energy_preference] || [4, 7]
    if (videoTone.energy >= min && videoTone.energy <= max) {
      score += energyWeight
      reasons.push(`Energy level: ${brandPrefs.energy_preference}`)
    } else {
      const diff = Math.min(Math.abs(videoTone.energy - min), Math.abs(videoTone.energy - max))
      score += energyWeight * Math.max(0, 1 - diff * 0.15)
    }
  } else {
    score += energyWeight * 0.5
  }

  // Formality match (0.2 weight)
  const formalityWeight = 0.2
  if (videoTone.formality !== null) {
    const formalityMap: Record<string, [number, number]> = {
      'casual': [1, 4],
      'balanced': [4, 7],
      'professional': [7, 10]
    }
    const [min, max] = formalityMap[brandPrefs.formality_preference] || [4, 7]
    if (videoTone.formality >= min && videoTone.formality <= max) {
      score += formalityWeight
      reasons.push(`Formality: ${brandPrefs.formality_preference}`)
    } else {
      const diff = Math.min(Math.abs(videoTone.formality - min), Math.abs(videoTone.formality - max))
      score += formalityWeight * Math.max(0, 1 - diff * 0.15)
    }
  } else {
    score += formalityWeight * 0.5
  }

  // Warmth match (0.2 weight)
  const warmthWeight = 0.2
  if (videoTone.warmth !== null) {
    const warmthMap: Record<string, [number, number]> = {
      'cool': [1, 4],
      'neutral': [4, 7],
      'warm': [7, 10]
    }
    const [min, max] = warmthMap[brandPrefs.warmth_preference] || [4, 7]
    if (videoTone.warmth >= min && videoTone.warmth <= max) {
      score += warmthWeight
      reasons.push(`Warmth: ${brandPrefs.warmth_preference}`)
    } else {
      const diff = Math.min(Math.abs(videoTone.warmth - min), Math.abs(videoTone.warmth - max))
      score += warmthWeight * Math.max(0, 1 - diff * 0.15)
    }
  } else {
    score += warmthWeight * 0.5
  }

  return {
    name: 'tone_match',
    score,
    weight: WEIGHTS.TONE,
    explanation: reasons.join('; ') || 'Tone analysis incomplete'
  }
}

// =============================================================================
// FORMAT APPROPRIATENESS (20%)
// =============================================================================

/**
 * Score how appropriate the content format is for the brand
 */
export function scoreFormatAppropriateness(
  videoFormat: ContentFormat,
  brandTarget: TargetAudienceDefinition
): SoftScoreComponent {
  let score = 0.5 // Base score
  const reasons: string[] = []

  // Intent alignment with occasion
  const intentOccasionFit: Record<string, string[]> = {
    'entertain': ['casual_dining', 'bar_drinks', 'brunch'],
    'inspire': ['special_occasion', 'casual_dining'],
    'inform': ['quick_meal', 'takeout', 'delivery'],
    'sell': ['takeout', 'delivery', 'quick_meal'],
    'connect': ['casual_dining', 'coffee_cafe', 'brunch'],
    'comfort': ['casual_dining', 'takeout', 'delivery']
  }

  if (videoFormat.primary_intent && brandTarget.primary_occasion) {
    const goodFit = intentOccasionFit[videoFormat.primary_intent] || []
    if (goodFit.includes(brandTarget.primary_occasion)) {
      score += 0.25
      reasons.push(`${videoFormat.primary_intent} fits ${brandTarget.primary_occasion}`)
    }
  }

  // Repeatable format bonus (brands like consistency)
  if (videoFormat.has_repeatable_format) {
    score += 0.15
    reasons.push('Repeatable format')
  }

  // CTA alignment
  if (videoFormat.cta_types.length > 0) {
    const visitCtas = ['visit_in_store', 'book_now', 'order_online']
    const hasVisitCta = videoFormat.cta_types.some(c => visitCtas.includes(c))
    if (hasVisitCta) {
      score += 0.1
      reasons.push('Visit-driving CTA')
    }
  }

  return {
    name: 'format_appropriateness',
    score: Math.min(1, score),
    weight: WEIGHTS.FORMAT,
    explanation: reasons.join('; ') || 'Format analysis'
  }
}

// =============================================================================
// ASPIRATION ALIGNMENT (15%)
// =============================================================================

/**
 * Score how well the video's quality aligns with the brand's aspirations
 * KEY INSIGHT: Quality difference is an OPPORTUNITY, not a penalty
 */
export function scoreAspirationAlignment(
  videoQuality: { execution_quality: number; production_investment: number; distinctiveness: number },
  brandAmbition: AmbitionLevel
): SoftScoreComponent {
  let score = 0.5
  const reasons: string[] = []

  // Compute video quality tier
  const avgQuality = (videoQuality.execution_quality + videoQuality.distinctiveness) / 2
  let videoTier: 'low' | 'medium' | 'high'
  if (avgQuality < 0.4) videoTier = 'low'
  else if (avgQuality < 0.7) videoTier = 'medium'
  else videoTier = 'high'

  // Alignment based on aspiration
  if (brandAmbition.aspiration === 'match_current') {
    // Brand wants content at their level
    if (videoTier === brandAmbition.current_quality) {
      score = 1.0
      reasons.push('Quality matches current level')
    } else {
      const tierOrder = ['low', 'medium', 'high']
      const diff = Math.abs(tierOrder.indexOf(videoTier) - tierOrder.indexOf(brandAmbition.current_quality))
      score = diff === 1 ? 0.6 : 0.3
      reasons.push(`Quality ${videoTier}, brand is ${brandAmbition.current_quality}`)
    }
  } else if (brandAmbition.aspiration === 'level_up') {
    // Brand wants to improve - bonus for slightly higher quality
    const tierOrder = ['low', 'medium', 'high']
    const videoIdx = tierOrder.indexOf(videoTier)
    const brandIdx = tierOrder.indexOf(brandAmbition.current_quality)
    
    if (videoIdx === brandIdx + 1) {
      score = 1.0
      reasons.push('Quality uplift opportunity!')
    } else if (videoIdx === brandIdx) {
      score = 0.7
      reasons.push('Matches current quality')
    } else if (videoIdx > brandIdx + 1) {
      score = 0.5
      reasons.push('Quality gap may be too large')
    } else {
      score = 0.4
      reasons.push('Below current quality')
    }
  } else if (brandAmbition.aspiration === 'aspirational') {
    // Brand wants to see high-end examples
    if (videoTier === 'high') {
      score = 1.0
      reasons.push('High-quality aspirational content')
    } else if (videoTier === 'medium') {
      score = 0.6
      reasons.push('Mid-quality content')
    } else {
      score = 0.3
      reasons.push('Below aspirational level')
    }
  }

  return {
    name: 'aspiration_alignment',
    score,
    weight: WEIGHTS.ASPIRATION,
    explanation: reasons.join('; ')
  }
}

// =============================================================================
// MAIN SCORING PIPELINE
// =============================================================================

/**
 * Run all soft scoring components and compute weighted total
 */
export function runSoftScoringPipeline(
  video: VideoFingerprint,
  brand: BrandFingerprint
): { scores: SoftScoreComponent[]; overall: number } {
  const scores: SoftScoreComponent[] = []

  // 1. Audience alignment (35%)
  scores.push(scoreAudienceAlignment(video.audience_signals, brand.target_audience))

  // 2. Tone match (30%)
  scores.push(scoreToneMatch(video.tone_profile, brand.tone_preferences))

  // 3. Format appropriateness (20%)
  scores.push(scoreFormatAppropriateness(video.format, brand.target_audience))

  // 4. Aspiration alignment (15%)
  scores.push(scoreAspirationAlignment(video.quality_baseline, brand.ambition_level))

  // Compute weighted total
  const overall = scores.reduce((sum, s) => sum + s.score * s.weight, 0)

  return { scores, overall }
}

/**
 * Get match summary for UI display
 */
export function getMatchSummary(scores: SoftScoreComponent[]): {
  audience_fit: number;
  tone_match: number;
  format_fit: number;
  aspiration_alignment: number;
} {
  const findScore = (name: string) => scores.find(s => s.name === name)?.score || 0
  
  return {
    audience_fit: findScore('audience_alignment'),
    tone_match: findScore('tone_match'),
    format_fit: findScore('format_appropriateness'),
    aspiration_alignment: findScore('aspiration_alignment')
  }
}
