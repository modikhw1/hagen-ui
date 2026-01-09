/**
 * Translation Layer: Backend Signals → Category Keys
 *
 * Converts backend analysis data into category keys.
 * The display layer (display.ts) then converts keys to UI values.
 *
 * Signal → Key → Display
 * (execution_skill: 3) → 'medium' → { label: 'Medel', color: '#C4A35A' }
 */

import type { Difficulty, FilmTime, PeopleNeeded, HumorMechanism, Market } from './display'

// ============================================
// BACKEND TYPES (from Hagen analysis)
// ============================================

export interface BackendReplicability {
  equipment_needs?: number      // 1-10
  execution_skill?: number      // 1-10
  timing_complexity?: number    // 1-10
  concept_difficulty?: number   // 1-10
  talent_requirement?: number   // 1-10
  location_dependency?: number  // 1-10
  post_production_level?: number // 1-10
  overall_replicability_score?: number
  replicability_notes?: string
}

export interface BackendAudienceSignals {
  primary_ages?: Array<{ primary: string; secondary?: string }>
  vibe_alignments?: string[]
  engagement_style?: string
  niche_specificity?: number
}

export interface BackendReplicabilitySignals {
  time_investment?: number      // 1-10 (higher = easier/less time)
  skill_requirements?: number   // 1-10 (higher = easier/less skill)
  budget_requirements?: number  // 1-10 (higher = more expensive)
  equipment_requirements?: number // 1-10
}

export interface BackendHumorAnalysis {
  handling?: string             // [GOOD], [MEDIOCRE], [BAD]
  mechanism?: string            // Subversion, Absurdism, etc.
  target_audience?: string
  why?: string
}

export interface BackendClip {
  id: string
  url: string
  platform?: string
  gcs_uri?: string

  // Analysis data
  humor_analysis?: BackendHumorAnalysis
  replicability?: BackendReplicability
  audience_signals?: BackendAudienceSignals
  replicability_signals?: BackendReplicabilitySignals
  replicability_analysis?: string  // Swedish text description

  // Scene data
  scene_breakdown?: Array<{
    timestamp: string
    duration?: string
    audio: string
    visual: string
    narrative_function: string
  }>

  // Meta
  origin_country?: string
  created_at?: string
}

// ============================================
// TRANSLATED CONCEPT (output format)
// Uses category keys, not display strings
// ============================================

export interface TranslatedConcept {
  id: string
  headline: string
  matchPercentage: number

  // Category keys (display layer converts to labels)
  difficulty: Difficulty
  filmTime: FilmTime
  peopleNeeded: PeopleNeeded
  mechanism: HumorMechanism
  market: Market
  trendLevel: number  // 1-5

  // Arrays
  vibeAlignments: string[]
  whyItFits: string[]

  // Metadata
  price: number
  isNew?: boolean
  remaining?: number
  sourceUrl?: string
  gcsUri?: string

  // Swedish content fields (from overrides or defaults)
  headline_sv?: string
  description_sv?: string
  whyItWorks_sv?: string
  script_sv?: string
  productionNotes_sv?: string[]
  whyItFits_sv?: string[]
}

// ============================================
// TRANSLATION FUNCTIONS
// Output category keys, not display strings
// ============================================

/**
 * Maps backend signals to difficulty key
 */
function translateDifficulty(clip: BackendClip): Difficulty {
  const signals = clip.replicability_signals
  const repl = clip.replicability

  // replicability_signals: inverted scale (high = easy)
  if (signals?.skill_requirements !== undefined) {
    const skill = signals.skill_requirements
    if (skill >= 8) return 'easy'
    if (skill >= 5) return 'medium'
    return 'advanced'
  }

  // replicability: normal scale (low = easy)
  if (repl?.execution_skill !== undefined) {
    const skill = repl.execution_skill
    if (skill <= 3) return 'easy'
    if (skill <= 5) return 'medium'
    return 'advanced'
  }

  // Default based on handling
  const handling = clip.humor_analysis?.handling?.toLowerCase() || ''
  if (handling.includes('good')) return 'easy'
  if (handling.includes('bad')) return 'advanced'
  return 'medium'
}

/**
 * Maps backend signals to people needed key
 */
function translatePeopleNeeded(clip: BackendClip): PeopleNeeded {
  const repl = clip.replicability
  const notes = clip.replicability_analysis?.toLowerCase() || ''
  const replNotes = repl?.replicability_notes?.toLowerCase() || ''
  const combined = notes + ' ' + replNotes

  // Check for multiple people indicators
  if (combined.includes('4') || combined.includes('four') || combined.includes('team')) {
    return 'team'
  }
  if (combined.includes('tre') || combined.includes('three') || combined.includes('3')) {
    return 'small_team'
  }
  if (combined.includes('två') || combined.includes('two') || combined.includes('2') ||
      combined.includes('performers') || combined.includes('skådespelare')) {
    return 'duo'
  }

  // Check talent_requirement
  if (repl?.talent_requirement !== undefined && repl.talent_requirement >= 4) {
    return 'duo'
  }

  return 'solo'
}

/**
 * Maps backend signals to film time key
 */
function translateFilmTime(clip: BackendClip): FilmTime {
  const signals = clip.replicability_signals
  const repl = clip.replicability

  // time_investment: higher = less time needed
  if (signals?.time_investment !== undefined) {
    const time = signals.time_investment
    if (time >= 9) return '5min'
    if (time >= 7) return '10min'
    if (time >= 5) return '15min'
    if (time >= 3) return '30min'
    return '1hr_plus'
  }

  // timing_complexity: lower = faster
  if (repl?.timing_complexity !== undefined) {
    const complexity = repl.timing_complexity
    if (complexity <= 2) return '5min'
    if (complexity <= 4) return '15min'
    if (complexity <= 6) return '30min'
    return '1hr'
  }

  return '15min'
}

/**
 * Maps backend humor mechanism to key
 */
function translateMechanism(clip: BackendClip): HumorMechanism {
  const mechanism = clip.humor_analysis?.mechanism?.toLowerCase() || ''

  if (mechanism.includes('subversion')) return 'subversion'
  if (mechanism.includes('contrast')) return 'contrast'
  if (mechanism.includes('recognition') || mechanism.includes('relatable')) return 'recognition'
  if (mechanism.includes('dark')) return 'dark'
  if (mechanism.includes('escalat')) return 'escalation'
  if (mechanism.includes('deadpan')) return 'deadpan'
  if (mechanism.includes('absurd')) return 'absurdism'

  return 'subversion' // default
}

/**
 * Maps backend signals to trend level (1-5)
 */
function translateTrendLevel(clip: BackendClip): number {
  const handling = clip.humor_analysis?.handling?.toLowerCase() || ''

  if (handling.includes('good')) return 4
  if (handling.includes('mediocre')) return 3
  if (handling.includes('bad')) return 2

  return 3
}

/**
 * Extracts market from URL or analysis
 */
function translateMarket(clip: BackendClip): Market {
  const url = clip.url.toLowerCase()

  if (url.includes('_se') || url.includes('stockholm') || url.includes('sweden')) {
    return 'SE'
  }
  if (url.includes('_uk') || url.includes('london') || url.includes('newtown')) {
    return 'UK'
  }
  if (clip.replicability_analysis?.match(/[åäö]/i)) {
    return 'SE'
  }

  return 'US'
}

/**
 * Extracts vibe alignments
 */
function translateVibes(clip: BackendClip): string[] {
  return clip.audience_signals?.vibe_alignments || []
}

/**
 * Generates "why it fits" reasons
 */
function translateWhyItFits(clip: BackendClip): string[] {
  const reasons: string[] = []
  const audience = clip.audience_signals
  const repl = clip.replicability_analysis?.toLowerCase() || ''

  if (audience?.vibe_alignments?.includes('foodies')) {
    reasons.push('Works great for food businesses')
  }
  if (audience?.vibe_alignments?.includes('locals')) {
    reasons.push('Perfect for driving local traffic')
  }
  if (repl.includes('enkel') || repl.includes('simple')) {
    reasons.push('Simple to execute')
  }
  if (repl.includes('solo') || repl.includes('en person')) {
    reasons.push('You can film this yourself')
  }

  if (reasons.length === 0) {
    reasons.push('Proven format that works')
  }

  return reasons.slice(0, 3)
}

/**
 * Generates headline from scene breakdown or analysis
 */
function translateHeadline(clip: BackendClip): string {
  const scenes = clip.scene_breakdown

  if (scenes && scenes.length > 0) {
    const firstScene = scenes[0].audio
    if (firstScene && firstScene.length < 80) {
      return firstScene
    }
  }

  return 'Trending concept for your business'
}

// ============================================
// OVERRIDE TYPES (from clips.json overrides section)
// ============================================

export interface ClipOverride {
  headline_sv?: string
  description_sv?: string
  whyItWorks_sv?: string
  script_sv?: string
  productionNotes_sv?: string[]
  whyItFits_sv?: string[]
  matchPercentage?: number
  price?: number
  isNew?: boolean
  remaining?: number
}

export interface ClipDefaults {
  headline_sv: string
  description_sv: string
  whyItWorks_sv: string
  script_sv: string
  productionNotes_sv: string[]
  whyItFits_sv: string[]
}

// ============================================
// MAIN TRANSLATOR
// ============================================

/**
 * Converts a backend clip to translated concept
 * Merges Swedish fields from override (or defaults if missing)
 */
export function translateClipToConcept(
  clip: BackendClip,
  override?: ClipOverride,
  defaults?: ClipDefaults
): TranslatedConcept {
  // Build concept with category keys
  const concept: TranslatedConcept = {
    id: clip.id,
    headline: override?.headline_sv || translateHeadline(clip),
    matchPercentage: override?.matchPercentage ?? 85,

    // Category keys
    difficulty: translateDifficulty(clip),
    filmTime: translateFilmTime(clip),
    peopleNeeded: translatePeopleNeeded(clip),
    mechanism: translateMechanism(clip),
    market: translateMarket(clip),
    trendLevel: translateTrendLevel(clip),

    // Arrays
    vibeAlignments: translateVibes(clip),
    whyItFits: override?.whyItFits_sv || translateWhyItFits(clip),

    // Metadata
    price: override?.price ?? 24,
    isNew: override?.isNew,
    remaining: override?.remaining,
    sourceUrl: clip.url,
    gcsUri: clip.gcs_uri,

    // Swedish content fields (prefer override, fallback to defaults)
    headline_sv: override?.headline_sv || defaults?.headline_sv,
    description_sv: override?.description_sv || defaults?.description_sv,
    whyItWorks_sv: override?.whyItWorks_sv || defaults?.whyItWorks_sv,
    script_sv: override?.script_sv || defaults?.script_sv,
    productionNotes_sv: override?.productionNotes_sv || defaults?.productionNotes_sv,
    whyItFits_sv: override?.whyItFits_sv || defaults?.whyItFits_sv,
  }

  return concept
}

/**
 * Batch translate multiple clips
 */
export function translateClips(
  clips: BackendClip[],
  overridesMap?: Record<string, ClipOverride>,
  defaults?: ClipDefaults
): TranslatedConcept[] {
  return clips.map(clip =>
    translateClipToConcept(clip, overridesMap?.[clip.id], defaults)
  )
}
