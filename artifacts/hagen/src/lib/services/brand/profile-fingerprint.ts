/**
 * Profile Fingerprint Service
 *
 * Computes a multi-layer fingerprint from a set of video embeddings and signals.
 * Layer weights: Quality (L1) > Likeness (L2) > Visual (L3)
 * 
 * σTaste v1.1 Weight Configuration (Dec 2025)
 * Based on 254 pairwise comparisons from hagen_ta analysis
 */

import { createClient } from '@supabase/supabase-js'
import type {
  ProfileFingerprint,
  FingerprintInput,
  MatchResult,
  L1QualityLayer,
  L2LikenessLayer,
  L3VisualLayer
} from './profile-fingerprint.types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// -----------------------------------------------------------------------------
// σTaste v1.1 Weight Configuration
// Source: hagen_ta 254 pairwise comparisons correlation analysis
// -----------------------------------------------------------------------------

/**
 * Signal weights based on correlation analysis from hagen_ta.
 * Higher correlation = stronger predictor of preference.
 * Negative correlation (hookStrength) = inverse relationship with preference.
 */
export const SIGMA_TASTE_WEIGHTS = {
  // TOP PREDICTORS (weight UP)
  attentionRetention: 2.0,    // r=+0.173, top predictor
  audioQuality: 1.8,          // r=+0.169, 2nd strongest (often unnoticed)
  cutsPerMinute: 1.5,         // r=+0.129, pacing proxy
  scriptOriginality: 1.4,     // r=+0.123, creativity signal
  
  // STANDARD WEIGHT
  productionPolish: 1.0,
  performerExecution: 1.0,
  narrativeFlow: 1.0,
  payoffQuality: 1.0,
  
  // WEIGHT DOWN (low/negative correlation)
  hookStrength: 0.5,          // r=-0.047, NEGATIVE correlation - desperation signal
  scriptReplicability: 0.7,   // r=+0.033, discussed but doesn't predict
  technicalPacing: 0.8,       // weak signal
  
  // NEW v1.1-sigma: Hook desperation penalty
  desperationPenalty: -0.3,   // Applied when desperation_signals.detected = true
} as const

/**
 * Layer matching weights for overall match computation.
 */
export const LAYER_MATCH_WEIGHTS = {
  l1_quality: 0.25,
  l2_likeness: 0.35,
  l3_visual: 0.10,
  embedding: 0.30,
} as const

// -----------------------------------------------------------------------------
// Video data fetching
// -----------------------------------------------------------------------------

interface VideoRecord {
  id: string
  video_url: string
  platform: string
  content_embedding: number[] | null
  visual_analysis: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

interface RatingRecord {
  video_id: string
  overall_score: number | null
  dimensions: Record<string, unknown> | null
}

interface BrandRatingRecord {
  video_id: string
  ai_analysis: {
    kind?: string
    model_analysis?: {
      signals?: Record<string, unknown>
      scores?: Record<string, unknown>
      raw_output?: {
        signals?: Record<string, unknown>
        scores?: Record<string, unknown>
      }
    }
  } | null
  extracted_signals: Record<string, unknown> | null
  // NEW v1.1: Direct JSONB columns from analyze-rate-v1
  replicability_signals: Record<string, unknown> | null
  risk_level_signals: Record<string, unknown> | null
  environment_signals: Record<string, unknown> | null
  audience_signals: Record<string, unknown> | null
}

/**
 * Fetch video records by URL. Returns found videos and lists missing URLs.
 */
export async function fetchOrCreateVideos(videoUrls: string[]): Promise<{
  videos: VideoRecord[];
  found: string[];
  missing: string[];
}> {
  const { data: existing, error } = await supabase
    .from('analyzed_videos')
    .select('id, video_url, platform, content_embedding, visual_analysis, metadata')
    .in('video_url', videoUrls)

  if (error) throw error

  const existingUrls = new Set((existing || []).map((v) => v.video_url))
  const missing = videoUrls.filter((url) => !existingUrls.has(url))
  const found = videoUrls.filter((url) => existingUrls.has(url))

  if (missing.length > 0) {
    console.warn(`[fingerprint] ${missing.length} videos not in DB:`, missing)
  }

  return {
    videos: (existing || []) as VideoRecord[],
    found,
    missing
  }
}

/**
 * Fetch ratings for a set of video IDs.
 */
async function fetchRatings(videoIds: string[]): Promise<Map<string, RatingRecord>> {
  const { data, error } = await supabase
    .from('video_ratings')
    .select('video_id, overall_score, dimensions')
    .in('video_id', videoIds)

  if (error) throw error

  const map = new Map<string, RatingRecord>()
  for (const r of data || []) {
    map.set(r.video_id, r as RatingRecord)
  }
  return map
}

/**
 * Fetch brand ratings (Schema v1) for a set of video IDs.
 * Fetches from BOTH rater_id='schema_v1' (old flow) and rater_id='primary' (new analyze-rate-v1 flow)
 */
async function fetchBrandRatings(videoIds: string[]): Promise<Map<string, BrandRatingRecord>> {
  const { data, error } = await supabase
    .from('video_brand_ratings')
    .select('video_id, ai_analysis, extracted_signals, replicability_signals, risk_level_signals, environment_signals, audience_signals, rater_id')
    .in('video_id', videoIds)

  if (error) throw error

  // Prefer 'primary' (analyze-rate-v1) over 'schema_v1' (old flow) if both exist
  const map = new Map<string, BrandRatingRecord>()
  for (const r of data || []) {
    const existing = map.get(r.video_id)
    // If we already have a 'primary' record, skip 'schema_v1'
    if (existing && r.rater_id === 'schema_v1') continue
    map.set(r.video_id, r as BrandRatingRecord)
  }
  return map
}

// -----------------------------------------------------------------------------
// Helper functions
// -----------------------------------------------------------------------------

function average(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function mode<T>(items: T[]): T | null {
  if (items.length === 0) return null
  const counts = new Map<T, number>()
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1)
  }
  let maxCount = 0
  let maxItem: T | null = null
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count
      maxItem = item
    }
  }
  return maxItem
}

function topN<T>(items: T[], n: number): T[] {
  const counts = new Map<T, number>()
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([item]) => item)
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0,
    normA = 0,
    normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function addVectors(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + b[i])
}

function scaleVector(v: number[], s: number): number[] {
  return v.map((x) => x * s)
}

// -----------------------------------------------------------------------------
// Layer extraction
// -----------------------------------------------------------------------------

interface VideoSignals {
  quality_score: number | null
  execution_coherence: number | null
  distinctiveness: number | null
  confidence: number | null
  message_alignment: number | null
  energy: number | null
  warmth: number | null
  formality: number | null
  self_seriousness: number | null
  humor_types: string[]
  age_code: string | null
  humor_target: string | null
  meanness_risk: string | null
  accessibility: string | null
  price_tier: string | null
  edginess: string | null
  vibe: string[]
  occasions: string[]
  primary_intent: string | null
  cta_types: string[]
  subtext: string[]
  audiences: string[]
  traits: string[]
  service_ethos: string[]
  production_investment: number | null
  effortlessness: number | null
  intentionality: number | null
  social_permission: number | null
  has_repeatable_format: boolean
  format_name: string | null
  // NEW v1.1: Replicability signals
  actor_count: string | null
  setup_complexity: string | null
  skill_required: string | null
  environment_dependency: string | null
  equipment_needed: string[]
  estimated_time: string | null
  // NEW v1.1: Risk level signals
  content_edge: string | null
  humor_risk: string | null
  trend_reliance: string | null
  controversy_potential: string | null
  // NEW v1.1: Environment requirements
  setting_type: string | null
  space_requirements: string | null
  lighting_conditions: string | null
  noise_tolerance: string | null
  customer_visibility: string | null
  // NEW v1.1: Expanded target audience
  audience_age_primary: string | null
  audience_age_secondary: string | null
  audience_income_level: string | null
  audience_lifestyle_tags: string[]
  audience_primary_occasion: string | null
  audience_vibe_alignment: string | null
  // NEW v1.1: Humor presence flag
  humor_present: boolean
}

function extractSignals(
  video: VideoRecord,
  rating: RatingRecord | undefined,
  brandRating: BrandRatingRecord | undefined
): VideoSignals {
  const signals: VideoSignals = {
    quality_score: null,
    execution_coherence: null,
    distinctiveness: null,
    confidence: null,
    message_alignment: null,
    energy: null,
    warmth: null,
    formality: null,
    self_seriousness: null,
    humor_types: [],
    age_code: null,
    humor_target: null,
    meanness_risk: null,
    accessibility: null,
    price_tier: null,
    edginess: null,
    vibe: [],
    occasions: [],
    primary_intent: null,
    cta_types: [],
    subtext: [],
    audiences: [],
    traits: [],
    service_ethos: [],
    production_investment: null,
    effortlessness: null,
    intentionality: null,
    social_permission: null,
    has_repeatable_format: false,
    format_name: null,
    // NEW v1.1: Replicability
    actor_count: null,
    setup_complexity: null,
    skill_required: null,
    environment_dependency: null,
    equipment_needed: [],
    estimated_time: null,
    // NEW v1.1: Risk level
    content_edge: null,
    humor_risk: null,
    trend_reliance: null,
    controversy_potential: null,
    // NEW v1.1: Environment
    setting_type: null,
    space_requirements: null,
    lighting_conditions: null,
    noise_tolerance: null,
    customer_visibility: null,
    // NEW v1.1: Target audience
    audience_age_primary: null,
    audience_age_secondary: null,
    audience_income_level: null,
    audience_lifestyle_tags: [],
    audience_primary_occasion: null,
    audience_vibe_alignment: null,
    // NEW v1.1: Humor presence
    humor_present: false
  }

  // From video_ratings (quality)
  if (rating?.overall_score != null) {
    signals.quality_score = rating.overall_score
  }

  // From brand_ratings (Schema v1)
  // The data may be in two locations:
  // 1. model_analysis.signals (flattened format: personality_signals.energy)
  // 2. model_analysis.raw_output.signals (original format: personality.energy_1_10)
  const ai = brandRating?.ai_analysis
  if (ai?.kind === 'schema_v1_review' && ai.model_analysis) {
    const m = ai.model_analysis as Record<string, unknown>
    
    // Try raw_output first (original schema v1 format), then fallback to flattened
    const rawOutput = m.raw_output as Record<string, unknown> | undefined
    const rawSignals = rawOutput?.signals as Record<string, unknown> | undefined
    const rawScores = rawOutput?.scores as Record<string, unknown> | undefined
    
    // Flattened format (processed)
    const flatSignals = m.signals as Record<string, unknown> | undefined
    
    // Extract scores - try raw_output first
    if (rawScores) {
      signals.execution_coherence = (rawScores.execution_coherence_0_1 as number) ?? null
      signals.distinctiveness = (rawScores.distinctiveness_0_1 as number) ?? null
    }

    // Use raw_output.signals if available (original schema format)
    const s = rawSignals || flatSignals
    
    if (s) {
      // Personality - handle both formats
      const p = (s.personality || s.personality_signals) as Record<string, unknown> | undefined
      if (p) {
        // Original format: energy_1_10, flattened format: energy
        signals.energy = (p.energy_1_10 as number) ?? (p.energy as number) ?? null
        signals.warmth = (p.warmth_1_10 as number) ?? (p.warmth as number) ?? null
        signals.formality = (p.formality_1_10 as number) ?? (p.formality as number) ?? null
        signals.self_seriousness = (p.self_seriousness_1_10 as number) ?? (p.self_seriousness as number) ?? null
        signals.confidence = (p.confidence_1_10 as number) ?? (p.confidence as number) ?? null
        signals.traits = (p.traits_observed as string[]) ?? []
      }

      // Humor - handle both formats
      const h = (s.humor || s.humor_mix) as Record<string, unknown> | undefined
      if (h) {
        signals.humor_types = (h.humor_types as string[]) ?? []
        signals.age_code = (h.age_code as string) ?? null
        signals.humor_target = (h.humor_target as string) ?? null
        signals.meanness_risk = (h.meanness_risk as string) ?? null
      }

      // Hospitality - handle both formats  
      const hosp = (s.hospitality || s.hospitality_signals) as Record<string, unknown> | undefined
      if (hosp) {
        signals.vibe = (hosp.vibe as string[]) ?? []
        signals.price_tier = (hosp.price_tier as string) ?? null
        signals.accessibility = (hosp.accessibility as string) ?? null
        signals.edginess = (hosp.edginess as string) ?? null
        signals.occasions = (hosp.occasions as string[]) ?? []
        signals.service_ethos = (hosp.service_ethos as string[]) ?? []
      }

      // Statement - handle both formats
      const st = (s.statement || s.statement_signals) as Record<string, unknown> | undefined
      if (st) {
        signals.primary_intent = (st.primary_intent as string) ?? (st.content_intent as string) ?? null
        signals.cta_types = (st.cta_types as string[]) ?? []
        signals.subtext = (st.subtext as string[]) ?? []
        signals.audiences = (st.apparent_audience as string[]) ?? []
      }

      // Execution - handle both formats
      const ex = (s.execution || s.execution_signals) as Record<string, unknown> | undefined
      if (ex) {
        // Original format: production_investment_1_10, flattened: production_investment
        signals.production_investment = (ex.production_investment_1_10 as number) ?? (ex.production_investment as number) ?? null
        signals.effortlessness = (ex.effortlessness_1_10 as number) ?? (ex.effortlessness as number) ?? null
        signals.intentionality = (ex.intentionality_1_10 as number) ?? (ex.intentionality as number) ?? null
        signals.social_permission = (ex.social_permission_1_10 as number) ?? (ex.social_permission as number) ?? null
        signals.has_repeatable_format = (ex.has_repeatable_format as boolean) ?? false
        signals.format_name = (ex.format_name as string) ?? null
      }
      
      // Coherence - handle both formats
      const coh = (s.coherence || s.coherence_signals) as Record<string, unknown> | undefined
      if (coh) {
        signals.message_alignment = (coh.personality_message_alignment_0_1 as number) ?? (coh.message_alignment as number) ?? null
      }

      // NEW v1.1: Replicability signals
      const rep = s.replicability as Record<string, unknown> | undefined
      if (rep) {
        signals.actor_count = (rep.actor_count as string) ?? null
        signals.setup_complexity = (rep.setup_complexity as string) ?? null
        signals.skill_required = (rep.skill_required as string) ?? null
        signals.environment_dependency = (rep.environment_dependency as string) ?? null
        signals.equipment_needed = (rep.equipment_needed as string[]) ?? []
        signals.estimated_time = (rep.estimated_time as string) ?? null
      }

      // NEW v1.1: Risk level signals
      const risk = s.risk_level as Record<string, unknown> | undefined
      if (risk) {
        signals.content_edge = (risk.content_edge as string) ?? null
        signals.humor_risk = (risk.humor_risk as string) ?? null
        signals.trend_reliance = (risk.trend_reliance as string) ?? null
        signals.controversy_potential = (risk.controversy_potential as string) ?? null
      }

      // NEW v1.1: Environment requirements
      const env = s.environment_requirements as Record<string, unknown> | undefined
      if (env) {
        signals.setting_type = (env.setting_type as string) ?? null
        signals.space_requirements = (env.space_requirements as string) ?? null
        signals.lighting_conditions = (env.lighting_conditions as string) ?? null
        signals.noise_tolerance = (env.noise_tolerance as string) ?? null
        signals.customer_visibility = (env.customer_visibility as string) ?? null
      }

      // NEW v1.1: Expanded target audience
      const aud = s.target_audience as Record<string, unknown> | undefined
      if (aud) {
        const ageRange = aud.age_range as Record<string, unknown> | undefined
        signals.audience_age_primary = (ageRange?.primary as string) ?? null
        signals.audience_age_secondary = (ageRange?.secondary as string) ?? null
        signals.audience_income_level = (aud.income_level as string) ?? null
        signals.audience_lifestyle_tags = (aud.lifestyle_tags as string[]) ?? []
        signals.audience_primary_occasion = (aud.primary_occasion as string) ?? null
        signals.audience_vibe_alignment = (aud.vibe_alignment as string) ?? null
      }

      // NEW v1.1: Humor presence (from humor section)
      const humor = (s.humor || s.humor_mix) as Record<string, unknown> | undefined
      if (humor) {
        signals.humor_present = (humor.present as boolean) ?? false
      }
    }
  }

  // -------------------------------------------------------------------------
  // NEW: Also extract from direct JSONB columns (from analyze-rate-v1 flow)
  // These take precedence if they exist (more recent data)
  // -------------------------------------------------------------------------
  
  // Replicability signals from JSONB column
  if (brandRating?.replicability_signals) {
    const rep = brandRating.replicability_signals as Record<string, unknown>
    signals.actor_count = (rep.actor_count as string) ?? signals.actor_count
    signals.setup_complexity = (rep.setup_complexity as string) ?? signals.setup_complexity
    signals.skill_required = (rep.skill_required as string) ?? signals.skill_required
    signals.environment_dependency = (rep.environment_dependency as string) ?? signals.environment_dependency
    signals.equipment_needed = (rep.equipment_needed as string[]) ?? signals.equipment_needed
    signals.estimated_time = (rep.estimated_time as string) ?? signals.estimated_time
  }

  // Risk level signals from JSONB column
  if (brandRating?.risk_level_signals) {
    const risk = brandRating.risk_level_signals as Record<string, unknown>
    signals.content_edge = (risk.content_edge as string) ?? signals.content_edge
    signals.humor_risk = (risk.humor_risk as string) ?? signals.humor_risk
    signals.trend_reliance = (risk.trend_reliance as string) ?? signals.trend_reliance
    signals.controversy_potential = (risk.controversy_potential as string) ?? signals.controversy_potential
  }

  // Environment signals from JSONB column
  if (brandRating?.environment_signals) {
    const env = brandRating.environment_signals as Record<string, unknown>
    signals.setting_type = (env.setting_type as string) ?? signals.setting_type
    signals.space_requirements = (env.space_requirements as string) ?? signals.space_requirements
    signals.lighting_conditions = (env.lighting_conditions as string) ?? signals.lighting_conditions
    signals.noise_tolerance = (env.noise_tolerance as string) ?? signals.noise_tolerance
    signals.customer_visibility = (env.customer_visibility as string) ?? signals.customer_visibility
  }

  // Audience signals from JSONB column
  if (brandRating?.audience_signals) {
    const aud = brandRating.audience_signals as Record<string, unknown>
    const ageRange = aud.age_range as Record<string, unknown> | string[] | undefined
    
    // Handle both object format {primary, secondary} and array format ['gen_z', 'millennial']
    if (Array.isArray(ageRange) && ageRange.length > 0) {
      signals.audience_age_primary = ageRange[0] ?? signals.audience_age_primary
      signals.audience_age_secondary = ageRange[1] ?? signals.audience_age_secondary
    } else if (ageRange && typeof ageRange === 'object') {
      signals.audience_age_primary = ((ageRange as Record<string, unknown>).primary as string) ?? signals.audience_age_primary
      signals.audience_age_secondary = ((ageRange as Record<string, unknown>).secondary as string) ?? signals.audience_age_secondary
    }
    
    signals.audience_income_level = (aud.income_level as string) ?? signals.audience_income_level
    signals.audience_lifestyle_tags = (aud.lifestyle_tags as string[]) ?? signals.audience_lifestyle_tags
    signals.audience_primary_occasion = (aud.primary_occasion as string) ?? signals.audience_primary_occasion
    
    // Handle both single value and array for vibe_alignment
    const vibeAlign = aud.vibe_alignment
    if (Array.isArray(vibeAlign) && vibeAlign.length > 0) {
      signals.audience_vibe_alignment = vibeAlign[0] ?? signals.audience_vibe_alignment
    } else if (typeof vibeAlign === 'string') {
      signals.audience_vibe_alignment = vibeAlign ?? signals.audience_vibe_alignment
    }
  }

  return signals
}

// -----------------------------------------------------------------------------
// Weight computation
// -----------------------------------------------------------------------------

/**
 * Compute weight for a video based on quality and coherence.
 * Higher weight = more influence on fingerprint.
 * 
 * Updated with σTaste v1.1 weights from hagen_ta correlation analysis:
 * - audioQuality is 2nd strongest predictor (+0.169)
 * - attentionRetention is top predictor (+0.173)
 * - hookStrength has NEGATIVE correlation (-0.047) - desperation signal
 */
function computeVideoWeight(signals: VideoSignals): number {
  const quality = signals.quality_score ?? 0.5
  const coherence = signals.execution_coherence ?? 0.5
  
  // Base weight: Quality 50%, coherence 30%
  let weight = quality * 0.5 + coherence * 0.3
  
  // σTaste v1.1 adjustments based on correlation data
  
  // Audio quality boost (r=+0.169, 2nd strongest predictor)
  // Often unnoticed but highly predictive
  const audioQuality = signals.production_investment ?? 5 // production as proxy for audio
  if (audioQuality >= 7) {
    weight += 0.1 * SIGMA_TASTE_WEIGHTS.audioQuality / 10
  }
  
  // Intentionality boost (proxy for attention retention, r=+0.173)
  const intentionality = signals.intentionality ?? 5
  if (intentionality >= 7) {
    weight += 0.1 * SIGMA_TASTE_WEIGHTS.attentionRetention / 10
  }
  
  // Hook desperation penalty (hookStrength has NEGATIVE correlation)
  // If we detect desperation signals, reduce weight
  // This is extracted from sigma_taste in the full pipeline
  // For now, use a simple heuristic: very high "flash" with low substance
  const effortlessness = signals.effortlessness ?? 5
  const productionInvestment = signals.production_investment ?? 5
  
  // High production but low effortlessness might indicate "trying too hard"
  if (productionInvestment >= 8 && effortlessness <= 3) {
    weight -= 0.05 // Small penalty for "overproduced" content
  }
  
  // Clamp to valid range
  return Math.max(0.1, Math.min(1.0, weight))
}

// -----------------------------------------------------------------------------
// Personality summary generation
// -----------------------------------------------------------------------------

/**
 * Generate a human-readable personality summary from fingerprint layers.
 * This provides interpretable text that can guide content recommendations.
 */
function generatePersonalitySummary(
  l1: L1QualityLayer,
  l2: L2LikenessLayer,
  l3: L3VisualLayer,
  videoCount: number
): string {
  const parts: string[] = []

  // Quality assessment
  const qualityPct = Math.round((l1.avg_quality_score || 0) * 100)
  if (qualityPct >= 80) {
    parts.push('High-quality content creator')
  } else if (qualityPct >= 60) {
    parts.push('Solid content quality')
  } else if (qualityPct >= 40) {
    parts.push('Mixed content quality')
  } else {
    parts.push('Emerging content quality')
  }

  // Energy/warmth personality
  const energy = l2.avg_energy || 5
  const warmth = l2.avg_warmth || 5
  if (energy >= 7 && warmth >= 7) {
    parts.push('with an energetic and warm personality')
  } else if (energy >= 7) {
    parts.push('with high-energy, dynamic presence')
  } else if (warmth >= 7) {
    parts.push('with a warm, approachable tone')
  } else if (energy <= 3 && warmth <= 3) {
    parts.push('with a reserved, professional demeanor')
  } else if (energy <= 3) {
    parts.push('with a calm, measured approach')
  }

  // Humor style
  if (l2.dominant_humor_types.length > 0) {
    const humorStr = l2.dominant_humor_types.slice(0, 2).join(' and ')
    parts.push(`using ${humorStr} humor`)
  }

  // Vibe
  if (l2.dominant_vibe.length > 0) {
    const vibeStr = l2.dominant_vibe.slice(0, 2).join(', ')
    parts.push(`projecting a ${vibeStr} vibe`)
  }

  // Age targeting
  if (l2.dominant_age_code && l2.dominant_age_code !== 'mixed') {
    if (l2.dominant_age_code === 'younger') {
      parts.push('targeting a younger demographic')
    } else if (l2.dominant_age_code === 'older') {
      parts.push('appealing to a mature audience')
    } else if (l2.dominant_age_code === 'balanced') {
      parts.push('with broad age appeal')
    }
  }

  // Production style
  const production = l3.avg_production_investment || 5
  const effortlessness = l3.avg_effortlessness || 5
  if (production >= 7 && effortlessness >= 7) {
    parts.push('with polished yet natural-looking production')
  } else if (production >= 7) {
    parts.push('with high production value')
  } else if (effortlessness >= 7) {
    parts.push('with an effortless, authentic aesthetic')
  } else if (production <= 3) {
    parts.push('with lo-fi, raw production style')
  }

  // Price tier context
  if (l2.dominant_price_tier && l2.dominant_price_tier !== 'mixed') {
    if (l2.dominant_price_tier === 'luxury' || l2.dominant_price_tier === 'premium') {
      parts.push(`positioning in the ${l2.dominant_price_tier} segment`)
    }
  }

  // Combine into readable summary
  let summary = parts.join(', ') + '.'

  // Add reliability note
  if (videoCount < 5) {
    summary += ` (Based on ${videoCount} video${videoCount === 1 ? '' : 's'} — add more for better accuracy.)`
  }

  return summary
}

// -----------------------------------------------------------------------------
// Fingerprint computation
// -----------------------------------------------------------------------------

export async function computeFingerprint(input: FingerprintInput): Promise<ProfileFingerprint> {
  const { videos, found: urlsFound, missing: urlsNotFound } = await fetchOrCreateVideos(input.video_urls)

  if (videos.length === 0) {
    throw new Error('No videos found for fingerprint computation. Make sure videos are analyzed via /analyze-rate first.')
  }

  const videoIds = videos.map((v) => v.id)
  const [ratings, brandRatings] = await Promise.all([fetchRatings(videoIds), fetchBrandRatings(videoIds)])

  // Extract signals per video
  const videoSignals: Array<{ video: VideoRecord; signals: VideoSignals; weight: number }> = []

  for (const video of videos) {
    const rating = ratings.get(video.id)
    const brandRating = brandRatings.get(video.id)
    const signals = extractSignals(video, rating, brandRating)
    const weight = computeVideoWeight(signals)
    videoSignals.push({ video, signals, weight })
  }

  // Compute weighted centroid embedding
  const videosWithEmbeddings = videoSignals.filter((v) => v.video.content_embedding && v.video.content_embedding.length === 1536)

  let centroid: number[] = new Array(1536).fill(0)
  let totalWeight = 0

  for (const { video, weight } of videosWithEmbeddings) {
    centroid = addVectors(centroid, scaleVector(video.content_embedding!, weight))
    totalWeight += weight
  }

  if (totalWeight > 0) {
    centroid = scaleVector(centroid, 1 / totalWeight)
  }

  // Compute layer averages
  const allSignals = videoSignals.map((v) => v.signals)

  const l1Quality: L1QualityLayer = {
    avg_service_fit: average(allSignals.map((s) => s.quality_score).filter((x): x is number => x != null)),
    avg_execution_quality: average(allSignals.map((s) => s.execution_coherence).filter((x): x is number => x != null)),
    avg_execution_coherence: average(
      allSignals.map((s) => s.execution_coherence).filter((x): x is number => x != null)
    ),
    avg_distinctiveness: average(allSignals.map((s) => s.distinctiveness).filter((x): x is number => x != null)),
    avg_confidence: average(allSignals.map((s) => s.confidence).filter((x): x is number => x != null)),
    avg_message_alignment: average(allSignals.map((s) => s.message_alignment).filter((x): x is number => x != null)),
    avg_quality_score: average(allSignals.map((s) => s.quality_score).filter((x): x is number => x != null))
  }

  const allHumorTypes = allSignals.flatMap((s) => s.humor_types)
  const allVibes = allSignals.flatMap((s) => s.vibe)
  const allOccasions = allSignals.flatMap((s) => s.occasions || [])
  const allCTATypes = allSignals.flatMap((s) => s.cta_types || [])
  const allSubtext = allSignals.flatMap((s) => s.subtext || [])
  const allAudiences = allSignals.flatMap((s) => s.audiences || [])
  const allTraits = allSignals.flatMap((s) => s.traits || [])
  const allServiceEthos = allSignals.flatMap((s) => s.service_ethos || [])
  const ageCodes = allSignals.map((s) => s.age_code).filter((x): x is string => x != null)
  const priceTiers = allSignals.map((s) => s.price_tier).filter((x): x is string => x != null)
  const intents = allSignals.map((s) => s.primary_intent).filter((x): x is string => x != null)
  const humorTargets = allSignals.map((s) => s.humor_target).filter((x): x is string => x != null)
  const meannessRisks = allSignals.map((s) => s.meanness_risk).filter((x): x is string => x != null)
  const accessibilities = allSignals.map((s) => s.accessibility).filter((x): x is string => x != null)
  const edginesses = allSignals.map((s) => s.edginess).filter((x): x is string => x != null)

  const l2Likeness: L2LikenessLayer = {
    avg_energy: average(allSignals.map((s) => s.energy).filter((x): x is number => x != null)),
    avg_warmth: average(allSignals.map((s) => s.warmth).filter((x): x is number => x != null)),
    avg_formality: average(allSignals.map((s) => s.formality).filter((x): x is number => x != null)),
    avg_self_seriousness: average(allSignals.map((s) => s.self_seriousness).filter((x): x is number => x != null)),
    avg_confidence: average(allSignals.map((s) => s.confidence).filter((x): x is number => x != null)),
    dominant_humor_types: topN(allHumorTypes, 3),
    dominant_age_code: (mode(ageCodes) as L2LikenessLayer['dominant_age_code']) ?? 'mixed',
    dominant_humor_target: mode(humorTargets) || null,
    dominant_meanness_risk: (mode(meannessRisks) as L2LikenessLayer['dominant_meanness_risk']) || null,
    dominant_accessibility: (mode(accessibilities) as L2LikenessLayer['dominant_accessibility']) || null,
    dominant_price_tier: (mode(priceTiers) as L2LikenessLayer['dominant_price_tier']) ?? 'mixed',
    dominant_edginess: (mode(edginesses) as L2LikenessLayer['dominant_edginess']) || null,
    dominant_vibe: topN(allVibes, 3),
    dominant_occasion: topN(allOccasions, 3),
    dominant_intent: mode(intents),
    dominant_cta_types: topN(allCTATypes, 3),
    collected_subtext: [...new Set(allSubtext)],
    collected_audiences: [...new Set(allAudiences)],
    dominant_traits: topN(allTraits, 5),
    dominant_service_ethos: topN(allServiceEthos, 3)
  }

  const l3Visual: L3VisualLayer = {
    avg_production_investment: average(
      allSignals.map((s) => s.production_investment).filter((x): x is number => x != null)
    ),
    avg_effortlessness: average(allSignals.map((s) => s.effortlessness).filter((x): x is number => x != null)),
    avg_intentionality: average(allSignals.map((s) => s.intentionality).filter((x): x is number => x != null)),
    avg_social_permission: average(allSignals.map((s) => s.social_permission).filter((x): x is number => x != null)),
    has_repeatable_format_pct: allSignals.filter((s) => s.has_repeatable_format).length / allSignals.length,
    collected_format_names: [...new Set(allSignals.flatMap((s) => s.format_name ? [s.format_name] : []))]
  }

  // Build video weights map
  const videoWeights: Record<string, number> = {}
  for (const { video, weight } of videoSignals) {
    videoWeights[video.id] = weight
  }

  // Compute confidence based on data completeness
  const hasEmbedding = videosWithEmbeddings.length / videos.length
  const hasQuality =
    allSignals.filter((s) => s.quality_score != null).length / allSignals.length
  // Consider having brand signals if EITHER execution_coherence (from ai_analysis) OR v1.1 signals exist
  const hasBrandSignals =
    allSignals.filter((s) => 
      s.execution_coherence != null || 
      s.actor_count != null || 
      s.content_edge != null ||
      s.audience_age_primary != null
    ).length / allSignals.length
  const confidence = (hasEmbedding + hasQuality + hasBrandSignals) / 3

  const missingDataNotes: string[] = []
  if (urlsNotFound.length > 0) missingDataNotes.push(`${urlsNotFound.length} URLs not found in database`)
  if (hasEmbedding < 1) missingDataNotes.push(`${videos.length - videosWithEmbeddings.length} videos missing embeddings`)
  if (hasQuality < 1) missingDataNotes.push(`${allSignals.filter((s) => s.quality_score == null).length} videos missing quality scores`)
  // Updated: Check for ANY v1.1 signals, not just execution_coherence
  const videosWithoutSignals = allSignals.filter((s) => 
    s.execution_coherence == null && 
    s.actor_count == null && 
    s.content_edge == null &&
    s.audience_age_primary == null
  )
  if (videosWithoutSignals.length > 0)
    missingDataNotes.push(`${videosWithoutSignals.length} videos missing brand signals (rate via /analyze-rate-v1)`)

  const profileId = input.profile_id ?? `profile_${Date.now()}`

  // Generate personality summary from layer data
  const personalitySummary = generatePersonalitySummary(l1Quality, l2Likeness, l3Visual, videos.length)

  return {
    profile_id: profileId,
    profile_name: input.profile_name,
    video_ids: videoIds,
    video_count: videos.length,
    computed_at: new Date().toISOString(),
    embedding: centroid,
    video_weights: videoWeights,
    layers: {
      l1_quality: l1Quality,
      l2_likeness: l2Likeness,
      l3_visual: l3Visual
    },
    confidence,
    missing_data_notes: missingDataNotes,
    urls_not_found: urlsNotFound,
    urls_found: urlsFound,
    personality_summary: personalitySummary
  }
}

// -----------------------------------------------------------------------------
// Match computation
// -----------------------------------------------------------------------------

export async function computeMatch(
  candidateVideoId: string,
  fingerprint: ProfileFingerprint
): Promise<MatchResult> {
  // Fetch candidate video
  const { data: candidateVideo, error: videoError } = await supabase
    .from('analyzed_videos')
    .select('id, video_url, content_embedding')
    .eq('id', candidateVideoId)
    .single()

  if (videoError || !candidateVideo) {
    throw new Error(`Candidate video not found: ${candidateVideoId}`)
  }

  // Fetch candidate ratings and brand ratings
  const [ratings, brandRatings] = await Promise.all([
    fetchRatings([candidateVideoId]),
    fetchBrandRatings([candidateVideoId])
  ])

  const candidateSignals = extractSignals(
    candidateVideo as VideoRecord,
    ratings.get(candidateVideoId),
    brandRatings.get(candidateVideoId)
  )

  // Embedding similarity (raw cosine)
  const candidateEmbedding = candidateVideo.content_embedding as number[] | null
  let embeddingSimilarity = 0
  if (candidateEmbedding && candidateEmbedding.length === 1536 && fingerprint.embedding.length === 1536) {
    embeddingSimilarity = cosineSimilarity(candidateEmbedding, fingerprint.embedding)
  }

  // L1: Quality compatibility (is the candidate at similar quality level?)
  const candidateQuality = candidateSignals.quality_score ?? 0.5
  const fingerprintQuality = fingerprint.layers.l1_quality.avg_quality_score || 0.5
  // Quality compatibility: 1 if same level, lower if candidate is much lower quality
  const qualityDiff = Math.abs(candidateQuality - fingerprintQuality)
  const l1QualityCompatible = Math.max(0, 1 - qualityDiff * 2) // Penalize large gaps

  // L2: Likeness match (personality/tone alignment)
  const energyDiff = Math.abs(
    (candidateSignals.energy ?? 5) - (fingerprint.layers.l2_likeness.avg_energy || 5)
  ) / 10
  const warmthDiff = Math.abs(
    (candidateSignals.warmth ?? 5) - (fingerprint.layers.l2_likeness.avg_warmth || 5)
  ) / 10
  const humorOverlap = candidateSignals.humor_types.filter((h) =>
    fingerprint.layers.l2_likeness.dominant_humor_types.includes(h)
  ).length / Math.max(1, candidateSignals.humor_types.length, fingerprint.layers.l2_likeness.dominant_humor_types.length)
  const ageMatch = candidateSignals.age_code === fingerprint.layers.l2_likeness.dominant_age_code ? 1 : 0.5

  const l2LikenessMatch = (
    (1 - energyDiff) * 0.25 +
    (1 - warmthDiff) * 0.25 +
    humorOverlap * 0.3 +
    ageMatch * 0.2
  )

  // L3: Visual proximity (production value similarity)
  const prodDiff = Math.abs(
    (candidateSignals.production_investment ?? 5) - (fingerprint.layers.l3_visual.avg_production_investment || 5)
  ) / 10
  const effortDiff = Math.abs(
    (candidateSignals.effortlessness ?? 5) - (fingerprint.layers.l3_visual.avg_effortlessness || 5)
  ) / 10

  const l3VisualProximity = 1 - (prodDiff + effortDiff) / 2

  // Find closest and furthest videos in profile
  let closestVideoId: string | null = null
  let closestSimilarity = 0
  let furthestVideoId: string | null = null
  let furthestSimilarity = 1

  if (candidateEmbedding && candidateEmbedding.length === 1536) {
    const { data: profileVideos } = await supabase
      .from('analyzed_videos')
      .select('id, content_embedding')
      .in('id', fingerprint.video_ids)

    for (const pv of profileVideos || []) {
      if (pv.content_embedding && (pv.content_embedding as number[]).length === 1536) {
        const sim = cosineSimilarity(candidateEmbedding, pv.content_embedding as number[])
        if (sim > closestSimilarity) {
          closestSimilarity = sim
          closestVideoId = pv.id
        }
        if (sim < furthestSimilarity) {
          furthestSimilarity = sim
          furthestVideoId = pv.id
        }
      }
    }
  }

  // Overall match: weighted combination using configurable layer weights
  // L1 (quality) and L2 (likeness) matter most, L3 (visual) less, embedding is baseline
  const overallMatch =
    l1QualityCompatible * LAYER_MATCH_WEIGHTS.l1_quality +
    l2LikenessMatch * LAYER_MATCH_WEIGHTS.l2_likeness +
    l3VisualProximity * LAYER_MATCH_WEIGHTS.l3_visual +
    embeddingSimilarity * LAYER_MATCH_WEIGHTS.embedding

  // Generate explanation
  const explanationParts: string[] = []
  if (l2LikenessMatch > 0.7) explanationParts.push('Strong personality match')
  else if (l2LikenessMatch > 0.5) explanationParts.push('Moderate personality alignment')
  else explanationParts.push('Personality differs')

  if (humorOverlap > 0.5) explanationParts.push('similar humor style')
  if (l1QualityCompatible > 0.8) explanationParts.push('matching quality level')
  else if (candidateQuality > fingerprintQuality) explanationParts.push('higher quality than profile average')
  else if (candidateQuality < fingerprintQuality - 0.2) explanationParts.push('lower quality than profile standard')

  if (l3VisualProximity < 0.5) explanationParts.push('different production style')

  return {
    candidate_video_id: candidateVideoId,
    profile_id: fingerprint.profile_id,
    overall_match: Math.round(overallMatch * 100) / 100,
    layer_scores: {
      l1_quality_compatible: Math.round(l1QualityCompatible * 100) / 100,
      l2_likeness_match: Math.round(l2LikenessMatch * 100) / 100,
      l3_visual_proximity: Math.round(l3VisualProximity * 100) / 100,
      embedding_similarity: Math.round(embeddingSimilarity * 100) / 100
    },
    closest_video_id: closestVideoId,
    closest_similarity: Math.round(closestSimilarity * 100) / 100,
    furthest_video_id: furthestVideoId,
    furthest_similarity: Math.round(furthestSimilarity * 100) / 100,
    explanation: explanationParts.join(', ')
  }
}

// =============================================================================
// NEW v1.1: Conversion Functions - VideoSignals → VideoFingerprint
// =============================================================================

import type {
  VideoFingerprint,
  BrandFingerprint,
  ReplicabilityScore,
  RiskLevel,
  EnvironmentRequirements,
  AudienceSignals,
  ToneProfile,
  ContentFormat,
  TargetAudienceDefinition,
  OperationalConstraints,
  EnvironmentAvailability,
  TonePreferences,
  RiskTolerance,
  AmbitionLevel
} from './profile-fingerprint.types'

/**
 * Compute replicability feasibility score (0-1) from categorical signals
 */
function computeReplicabilityScore(signals: VideoSignals): number {
  let score = 1.0
  
  // Actor count penalty
  const actorPenalty: Record<string, number> = {
    'solo': 0, 'duo': 0.1, 'small_team': 0.25, 'large_team': 0.4
  }
  if (signals.actor_count) score -= actorPenalty[signals.actor_count] || 0
  
  // Setup complexity penalty
  const setupPenalty: Record<string, number> = {
    'phone_only': 0, 'basic_tripod': 0.1, 'lighting_setup': 0.2, 'full_studio': 0.35
  }
  if (signals.setup_complexity) score -= setupPenalty[signals.setup_complexity] || 0
  
  // Skill penalty
  const skillPenalty: Record<string, number> = {
    'anyone': 0, 'basic_editing': 0.1, 'intermediate': 0.2, 'professional': 0.35
  }
  if (signals.skill_required) score -= skillPenalty[signals.skill_required] || 0
  
  return Math.max(0, Math.min(1, score))
}

/**
 * Compute risk level score (0-1, higher = riskier) from categorical signals
 */
function computeRiskScore(signals: VideoSignals): number {
  let score = 0
  
  const edgeScore: Record<string, number> = {
    'brand_safe': 0, 'mildly_edgy': 0.25, 'edgy': 0.5, 'provocative': 0.8
  }
  if (signals.content_edge) score += edgeScore[signals.content_edge] || 0
  
  const humorRiskScore: Record<string, number> = {
    'safe_humor': 0, 'playful': 0.1, 'sarcastic': 0.3, 'dark_humor': 0.5
  }
  if (signals.humor_risk) score += humorRiskScore[signals.humor_risk] || 0
  
  const controversyScore: Record<string, number> = {
    'none': 0, 'low': 0.1, 'moderate': 0.3, 'high': 0.5
  }
  if (signals.controversy_potential) score += controversyScore[signals.controversy_potential] || 0
  
  return Math.min(1, score / 1.8) // Normalize
}

/**
 * Convert VideoSignals to VideoFingerprint
 */
export function signalsToVideoFingerprint(
  videoId: string,
  signals: VideoSignals,
  embedding: number[],
  videoUrl?: string
): VideoFingerprint {
  return {
    video_id: videoId,
    video_url: videoUrl,
    computed_at: new Date().toISOString(),
    
    format: {
      primary_intent: signals.primary_intent,
      has_repeatable_format: signals.has_repeatable_format,
      format_name: signals.format_name,
      cta_types: signals.cta_types
    },
    
    replicability: {
      actor_count: signals.actor_count as ReplicabilityScore['actor_count'],
      setup_complexity: signals.setup_complexity as ReplicabilityScore['setup_complexity'],
      skill_required: signals.skill_required as ReplicabilityScore['skill_required'],
      environment_dependency: signals.environment_dependency as ReplicabilityScore['environment_dependency'],
      equipment_needed: signals.equipment_needed,
      estimated_time: signals.estimated_time as ReplicabilityScore['estimated_time'],
      feasibility_score: computeReplicabilityScore(signals)
    },
    
    audience_signals: {
      age_primary: signals.audience_age_primary as AudienceSignals['age_primary'],
      age_secondary: signals.audience_age_secondary as AudienceSignals['age_secondary'],
      income_level: signals.audience_income_level as AudienceSignals['income_level'],
      lifestyle_tags: signals.audience_lifestyle_tags,
      primary_occasion: signals.audience_primary_occasion,
      vibe_alignment: signals.audience_vibe_alignment
    },
    
    tone_profile: {
      energy: signals.energy,
      warmth: signals.warmth,
      formality: signals.formality,
      self_seriousness: signals.self_seriousness,
      humor_present: signals.humor_present,
      humor_types: signals.humor_types,
      humor_target: signals.humor_target,
      meanness_risk: signals.meanness_risk
    },
    
    environment_requirements: {
      setting_type: signals.setting_type as EnvironmentRequirements['setting_type'],
      space_requirements: signals.space_requirements as EnvironmentRequirements['space_requirements'],
      lighting_conditions: signals.lighting_conditions as EnvironmentRequirements['lighting_conditions'],
      noise_tolerance: signals.noise_tolerance as EnvironmentRequirements['noise_tolerance'],
      customer_visibility: signals.customer_visibility as EnvironmentRequirements['customer_visibility']
    },
    
    risk_level: {
      content_edge: signals.content_edge as RiskLevel['content_edge'],
      humor_risk: signals.humor_risk as RiskLevel['humor_risk'],
      trend_reliance: signals.trend_reliance as RiskLevel['trend_reliance'],
      controversy_potential: signals.controversy_potential as RiskLevel['controversy_potential'],
      overall_risk_score: computeRiskScore(signals)
    },
    
    quality_baseline: {
      execution_quality: signals.execution_coherence ?? 0.5,
      production_investment: signals.production_investment ?? 5,
      distinctiveness: signals.distinctiveness ?? 0.5
    },
    
    embedding,
    confidence: signals.confidence ?? 0.5
  }
}

// =============================================================================
// NEW v1.1: BrandFingerprint Computation from Brand Profile Data
// =============================================================================

/**
 * Brand synthesis data structure (from /brand-profile conversation)
 */
interface BrandSynthesisData {
  brand_id: string
  brand_name: string
  narrative_summary?: string
  characteristics?: Record<string, unknown>
  tone?: Record<string, unknown>
  current_state?: Record<string, unknown>
  goals?: Record<string, unknown>
  target_audience?: Record<string, unknown>
  content_recommendations?: {
    formats_likely_to_fit?: string[]
    formats_to_avoid?: string[]
    topics_to_explore?: string[]
    production_level?: string
  }
  // NEW v1.1 fields (optional - collected from enhanced UI)
  operational_constraints?: Partial<OperationalConstraints>
  environment_availability?: Partial<EnvironmentAvailability>
  tone_preferences?: Partial<TonePreferences>
  risk_tolerance?: Partial<RiskTolerance>
  ambition_level?: Partial<AmbitionLevel>
}

/**
 * Infer target audience from synthesis data
 */
function inferTargetAudience(synthesis: BrandSynthesisData): TargetAudienceDefinition {
  const ta = synthesis.target_audience || {}
  
  return {
    age_primary: (ta.age_primary as TargetAudienceDefinition['age_primary']) || 'broad',
    age_secondary: ta.age_secondary as TargetAudienceDefinition['age_secondary'],
    income_level: (ta.income_level as TargetAudienceDefinition['income_level']) || 'mid_range',
    lifestyle_tags: (ta.lifestyle_tags as string[]) || [],
    primary_occasion: (ta.primary_occasion as string) || 'casual_dining',
    vibe: (ta.vibe as string) || 'classic'
  }
}

/**
 * Infer operational constraints from synthesis data
 */
function inferOperationalConstraints(synthesis: BrandSynthesisData): OperationalConstraints {
  const oc = synthesis.operational_constraints || {}
  const productionLevel = synthesis.content_recommendations?.production_level
  
  // Infer from production_level recommendation
  let defaultTeam: OperationalConstraints['team_size_available'] = 'solo'
  let defaultSkill: OperationalConstraints['skill_level'] = 'basic_editing'
  
  if (productionLevel === 'professional') {
    defaultTeam = 'small_team'
    defaultSkill = 'professional'
  } else if (productionLevel === 'polished') {
    defaultTeam = 'duo'
    defaultSkill = 'intermediate'
  }
  
  return {
    team_size_available: oc.team_size_available || defaultTeam,
    equipment_available: oc.equipment_available || ['smartphone'],
    time_per_video: oc.time_per_video || '1_4hrs',
    skill_level: oc.skill_level || defaultSkill
  }
}

/**
 * Infer environment availability from synthesis data
 */
function inferEnvironmentAvailability(synthesis: BrandSynthesisData): EnvironmentAvailability {
  const ea = synthesis.environment_availability || {}
  const characteristics = synthesis.characteristics || {}
  
  // Try to infer from business type or characteristics
  const businessType = characteristics.business_type as string | undefined
  let defaultSettings: EnvironmentAvailability['available_settings'] = ['kitchen', 'dining_room']
  
  if (businessType === 'bar') {
    defaultSettings = ['bar']
  } else if (businessType === 'cafe') {
    defaultSettings = ['storefront', 'dining_room']
  }
  
  return {
    available_settings: ea.available_settings || defaultSettings,
    space_available: ea.space_available || 'moderate',
    lighting_situation: ea.lighting_situation || 'mixed',
    noise_level: ea.noise_level || 'moderate',
    can_feature_customers: ea.can_feature_customers ?? true
  }
}

/**
 * Infer tone preferences from synthesis data
 */
function inferTonePreferences(synthesis: BrandSynthesisData): TonePreferences {
  const tp = synthesis.tone_preferences || {}
  const tone = synthesis.tone || {}
  
  // Try to infer from existing tone data
  let humorLevel: TonePreferences['humor_level'] = 'moderate'
  if (tone.humor === 'heavy' || tone.humor_level === 'high') humorLevel = 'heavy'
  else if (tone.humor === 'light' || tone.humor_level === 'low') humorLevel = 'light'
  else if (tone.humor === 'none') humorLevel = 'none'
  
  let energyPref: TonePreferences['energy_preference'] = 'moderate'
  if (tone.energy === 'high' || (tone.energy as number) > 7) energyPref = 'high'
  else if (tone.energy === 'low' || (tone.energy as number) < 4) energyPref = 'calm'
  
  return {
    humor_level: tp.humor_level || humorLevel,
    energy_preference: tp.energy_preference || energyPref,
    formality_preference: tp.formality_preference || 'casual',
    warmth_preference: tp.warmth_preference || 'warm'
  }
}

/**
 * Infer risk tolerance from synthesis data
 */
function inferRiskTolerance(synthesis: BrandSynthesisData): RiskTolerance {
  const rt = synthesis.risk_tolerance || {}
  
  return {
    max_content_edge: rt.max_content_edge || 'mildly_edgy',
    humor_risk_ok: rt.humor_risk_ok || 'playful',
    trend_following: rt.trend_following || 'light_trends'
  }
}

/**
 * Infer ambition level from synthesis data
 */
function inferAmbitionLevel(synthesis: BrandSynthesisData): AmbitionLevel {
  const al = synthesis.ambition_level || {}
  const currentState = synthesis.current_state || {}
  const goals = synthesis.goals || {}
  
  // Try to infer current quality from existing content assessment
  let currentQuality: AmbitionLevel['current_quality'] = 'medium'
  if (currentState.quality === 'high' || currentState.production_quality === 'professional') {
    currentQuality = 'high'
  } else if (currentState.quality === 'low' || currentState.production_quality === 'basic') {
    currentQuality = 'low'
  }
  
  // Infer aspiration from goals
  let aspiration: AmbitionLevel['aspiration'] = 'level_up'
  if (goals.improve_quality || goals.professionalize) {
    aspiration = 'level_up'
  } else if (goals.maintain) {
    aspiration = 'match_current'
  }
  
  return {
    current_quality: al.current_quality || currentQuality,
    aspiration: al.aspiration || aspiration,
    production_target: al.production_target || 'basic'
  }
}

/**
 * Compute BrandFingerprint from brand synthesis data
 */
export function computeBrandFingerprint(
  synthesis: BrandSynthesisData,
  contentEmbedding?: number[]
): BrandFingerprint {
  return {
    brand_id: synthesis.brand_id,
    brand_name: synthesis.brand_name,
    computed_at: new Date().toISOString(),
    
    target_audience: inferTargetAudience(synthesis),
    operational_constraints: inferOperationalConstraints(synthesis),
    environment_availability: inferEnvironmentAvailability(synthesis),
    tone_preferences: inferTonePreferences(synthesis),
    risk_tolerance: inferRiskTolerance(synthesis),
    ambition_level: inferAmbitionLevel(synthesis),
    
    content_embedding: contentEmbedding,
    narrative_summary: synthesis.narrative_summary,
    confidence: synthesis.narrative_summary ? 0.7 : 0.5
  }
}

/**
 * Convert a ProfileFingerprint's aggregated signals to representative VideoFingerprint
 * Useful for comparing profile-level data to individual videos
 */
export function profileToVideoFingerprint(
  profile: ProfileFingerprint
): VideoFingerprint {
  const l1 = profile.layers.l1_quality
  const l2 = profile.layers.l2_likeness
  const l3 = profile.layers.l3_visual
  
  return {
    video_id: `profile_${profile.profile_id}`,
    computed_at: profile.computed_at,
    
    format: {
      primary_intent: l2.dominant_intent,
      has_repeatable_format: l3.has_repeatable_format_pct > 0.5,
      format_name: l3.collected_format_names[0] || null,
      cta_types: l2.dominant_cta_types
    },
    
    replicability: {
      actor_count: null, // Not aggregated at profile level yet
      setup_complexity: null,
      skill_required: null,
      environment_dependency: null,
      equipment_needed: [],
      estimated_time: null,
      feasibility_score: 0.5 // Default
    },
    
    audience_signals: {
      age_primary: null,
      age_secondary: null,
      income_level: l2.dominant_price_tier === 'budget' ? 'budget' 
                   : l2.dominant_price_tier === 'luxury' ? 'luxury'
                   : l2.dominant_price_tier === 'premium' ? 'upscale'
                   : 'mid_range',
      lifestyle_tags: [],
      primary_occasion: l2.dominant_occasion[0] || null,
      vibe_alignment: l2.dominant_vibe[0] || null
    },
    
    tone_profile: {
      energy: l2.avg_energy,
      warmth: l2.avg_warmth,
      formality: l2.avg_formality,
      self_seriousness: l2.avg_self_seriousness,
      humor_present: l2.dominant_humor_types.length > 0,
      humor_types: l2.dominant_humor_types,
      humor_target: l2.dominant_humor_target,
      meanness_risk: l2.dominant_meanness_risk
    },
    
    environment_requirements: {
      setting_type: null,
      space_requirements: null,
      lighting_conditions: null,
      noise_tolerance: null,
      customer_visibility: null
    },
    
    risk_level: {
      content_edge: l2.dominant_edginess === 'safe' ? 'brand_safe'
                   : l2.dominant_edginess === 'mild' ? 'mildly_edgy'
                   : l2.dominant_edginess === 'edgy' ? 'edgy'
                   : 'brand_safe',
      humor_risk: l2.dominant_meanness_risk === 'low' ? 'safe_humor'
                 : l2.dominant_meanness_risk === 'medium' ? 'playful'
                 : 'sarcastic',
      trend_reliance: 'light_trends',
      controversy_potential: 'low',
      overall_risk_score: 0.2
    },
    
    quality_baseline: {
      execution_quality: l1.avg_execution_quality,
      production_investment: l3.avg_production_investment,
      distinctiveness: l1.avg_distinctiveness
    },
    
    embedding: profile.embedding,
    confidence: profile.confidence
  }
}
