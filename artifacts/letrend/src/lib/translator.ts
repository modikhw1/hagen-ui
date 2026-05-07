/**
 * Translation Layer: backend analysis -> UI-ready concept data
 */

import type {
  BusinessType,
  Difficulty,
  EstimatedBudget,
  FilmTime,
  HumorMechanism,
  Market,
  PeopleNeeded,
} from './display'

export interface BackendReplicability {
  equipment_needs?: number
  execution_skill?: number
  timing_complexity?: number
  concept_difficulty?: number
  talent_requirement?: number
  location_dependency?: number
  post_production_level?: number
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
  time_investment?: number
  skill_requirements?: number
  budget_requirements?: number
  equipment_requirements?: number
}

export interface BackendHumorAnalysis {
  handling?: string
  mechanism?: string
  target_audience?: string
  why?: string
}

// σTaste v1.1 schema (mirrored from artifacts/hagen/src/lib/services/signals/types.ts)
// Source of truth for the rich per-video signals hagen produces. We accept these
// either nested under `sigma_taste` or flattened at the top level of BackendClip.
export type ScriptMode = 'none' | 'text_overlay' | 'short_dialogue' | 'long_dialogue' | 'visual_only'

export type SigmaActorCount = 'solo' | 'duo' | 'small_group' | 'crowd'
export type SigmaSkillLevel = 'anyone' | 'comfortable_on_camera' | 'acting_required' | 'professional'
export type SigmaSetupComplexity = 'point_and_shoot' | 'basic_tripod' | 'multi_location' | 'elaborate_staging'
export type SigmaPropLevel = 'none' | 'common_items' | 'specific_props' | 'custom_fabrication'
export type SigmaBackdrop = 'any_venue' | 'similar_venue_type' | 'specific_setting_needed'
export type SigmaEditingSkill = 'basic_cuts' | 'timed_edits' | 'effects_required' | 'professional_post'
export type SigmaEstimatedTime = 'under_15min' | 'under_1hr' | 'half_day' | 'full_day_plus'

export interface BackendContentClassification {
  content_type?:
    | 'sketch_comedy'
    | 'reaction_content'
    | 'informational'
    | 'interview_format'
    | 'montage_visual'
    | 'tutorial_how_to'
    | 'testimonial'
    | 'promotional_direct'
    | 'trend_recreation'
    | 'hybrid'
  service_relevance?: 'in_scope' | 'out_of_scope' | 'edge_case'
  classification_reasoning?: string
  strata_id?:
    | 'hospitality_sketch'
    | 'workplace_relatable'
    | 'customer_interaction'
    | 'product_showcase'
    | 'atmosphere_vibe'
}

export interface BackendReplicabilityDecomposed {
  one_to_one_copy_feasibility?: {
    score?: 1 | 2 | 3
    reasoning?: string
    required_adaptations?: string[]
  }
  actor_requirements?: {
    count?: SigmaActorCount
    skill_level?: SigmaSkillLevel
    social_risk_required?: 'none' | 'mild' | 'significant' | 'extreme'
    appearance_dependency?: 'none' | 'low' | 'moderate' | 'high'
  }
  environment_requirements?: {
    backdrop_interchangeability?: SigmaBackdrop
    prop_dependency?: {
      level?: SigmaPropLevel
      items?: string[]
      substitutable?: boolean
    }
    setup_complexity?: SigmaSetupComplexity
  }
  production_requirements?: {
    editing_skill?: SigmaEditingSkill
    editing_as_punchline?: boolean
    estimated_time?: SigmaEstimatedTime
  }
  concept_transferability?: {
    product_swappable?: boolean
    humor_travels?: boolean
    audience_narrowing_factors?: string[]
  }
}

export interface BackendNarrativeFlow {
  story_direction?: 'linear_build' | 'escalating' | 'revelation_based' | 'circular' | 'fragmented'
  beat_progression?: {
    type?: 'incremental_heightening' | 'steady_examples' | 'dialogue_escalation' | 'visual_accumulation'
    additive_per_beat?: boolean
    filler_detected?: boolean
  }
  momentum_type?: 'building_to_climax' | 'steady_stream' | 'single_beat_payoff' | 'no_clear_structure'
  coherence_score?: 1 | 2 | 3 | 4 | 5
  coherence_notes?: string
}

export interface BackendPerformerExecution {
  concept_selling?: {
    score?: 1 | 2 | 3 | 4 | 5
    persona_clarity?: 'clear_character' | 'ambiguous' | 'just_themselves'
  }
  tonal_match?: { matches_content?: boolean; mismatch_notes?: string }
  commitment_signals?: {
    facial_expressiveness?: 'minimal' | 'appropriate' | 'highly_animated'
    physical_commitment?: 'static' | 'moderate_movement' | 'full_physical_comedy'
    embarrassment_tolerance?: 'safe_performance' | 'mild_vulnerability' | 'full_commitment'
  }
  performance_dependency?: 'concept_carries_itself' | 'good_delivery_helps' | 'requires_strong_performer'
}

export interface BackendHookAnalysis {
  hook_style?: 'relatable_situation' | 'question' | 'action' | 'visual_intrigue' | 'text_overlay' | 'sound_grab'
  desperation_signals?: { detected?: boolean; signals?: string[] }
  promise_quality?: { curiosity_generated?: 1 | 2 | 3 | 4 | 5; promise_fulfilled?: boolean; allows_slow_burn?: boolean }
  emotional_undertone?: string[]
}

export interface BackendPayoffAnalysis {
  payoff_type?: 'visual_reveal' | 'edit_cut' | 'dialogue_delivery' | 'twist' | 'callback' | 'escalation_peak'
  closure_quality?: {
    meaningful_ending?: boolean
    feels_empty?: boolean
    earned_vs_cheap?: 'fully_earned' | 'somewhat_earned' | 'cheap_shortcut' | 'no_real_payoff'
  }
  surprise_fit?: {
    predictability?: 'completely_obvious' | 'somewhat_expected' | 'pleasant_surprise' | 'total_twist'
    logical_in_hindsight?: boolean
  }
  trope_handling?: {
    uses_known_trope?: boolean
    trope_name?: string
    trope_treatment?: 'subverted_cleverly' | 'played_straight_well' | 'lazy_execution'
  }
  substance_level?: {
    content_type?: 'empty_calories' | 'moderate_substance' | 'genuinely_clever'
    memorability?: 1 | 2 | 3 | 4 | 5
  }
}

export interface BackendProductionPolish {
  audio_intentionality?: {
    purposeful?: boolean
    elements_aligned?: boolean
    comedic_audio_timing?: 'perfect' | 'good' | 'off' | 'none'
  }
  visual_intentionality?: {
    purposeful_framing?: boolean
    quality_consistency?: boolean
    lighting_appropriate?: boolean
  }
  polish_composite?: {
    score?: 1 | 2 | 3 | 4 | 5
    elevating_factors?: string[]
    detracting_factors?: string[]
  }
  cuts_per_minute?: number
  pacing_feel?: 'rushed' | 'snappy' | 'comfortable' | 'slow' | 'dragging'
}

export interface BackendSigmaTaste {
  schema_version?: string
  content_classification?: BackendContentClassification
  replicability_decomposed?: BackendReplicabilityDecomposed
  narrative_flow?: BackendNarrativeFlow
  performer_execution?: BackendPerformerExecution
  hook_analysis?: BackendHookAnalysis
  payoff_analysis?: BackendPayoffAnalysis
  production_polish?: BackendProductionPolish
  utility_score?: number
  quality_score?: number
  sigma_taste_final?: number
}

export interface BackendClip {
  id: string
  url: string
  platform?: string
  gcs_uri?: string
  humor_analysis?: BackendHumorAnalysis
  replicability?: BackendReplicability
  audience_signals?: BackendAudienceSignals
  replicability_signals?: BackendReplicabilitySignals
  replicability_analysis?: string
  script?: {
    transcript?: string
    conceptCore?: string
    hasScript?: boolean
    scriptQuality?: number | null
    humor?: {
      isHumorous?: boolean
      humorType?: string
      humorMechanism?: string
      handlingSummary?: string
      whyItWorks?: string
      tunedRawText?: string
      [key: string]: unknown
    }
  }
  scene_breakdown?: Array<{
    timestamp: string
    duration?: string
    audio: string
    visual: string
    narrative_function: string
  }>
  origin_country?: string
  created_at?: string
  source_url?: string
  metadata?: {
    title?: string | null
    thumbnail_url?: string | null
  }
  // σTaste v1.1-sigma signals from hagen. May be supplied either nested under
  // `sigma_taste` or flattened at top level — getSigma() normalises access.
  sigma_taste?: BackendSigmaTaste
  schema_version?: string
  content_classification?: BackendContentClassification
  replicability_decomposed?: BackendReplicabilityDecomposed
  narrative_flow?: BackendNarrativeFlow
  performer_execution?: BackendPerformerExecution
  hook_analysis?: BackendHookAnalysis
  payoff_analysis?: BackendPayoffAnalysis
  production_polish?: BackendProductionPolish
}

export function getSigma(clip: BackendClip): BackendSigmaTaste {
  const nested = clip.sigma_taste ?? {}
  return {
    schema_version: nested.schema_version ?? clip.schema_version,
    content_classification: nested.content_classification ?? clip.content_classification,
    replicability_decomposed: nested.replicability_decomposed ?? clip.replicability_decomposed,
    narrative_flow: nested.narrative_flow ?? clip.narrative_flow,
    performer_execution: nested.performer_execution ?? clip.performer_execution,
    hook_analysis: nested.hook_analysis ?? clip.hook_analysis,
    payoff_analysis: nested.payoff_analysis ?? clip.payoff_analysis,
    production_polish: nested.production_polish ?? clip.production_polish,
    utility_score: nested.utility_score,
    quality_score: nested.quality_score,
    sigma_taste_final: nested.sigma_taste_final,
  }
}

export function hasSigmaSignals(clip: BackendClip): boolean {
  const sigma = getSigma(clip)
  return Boolean(
    sigma.content_classification ||
      sigma.replicability_decomposed ||
      sigma.narrative_flow ||
      sigma.performer_execution ||
      sigma.hook_analysis ||
      sigma.payoff_analysis ||
      sigma.production_polish,
  )
}

export interface TranslatedConcept {
  id: string
  headline: string
  matchPercentage: number
  difficulty: Difficulty
  filmTime: FilmTime
  peopleNeeded: PeopleNeeded
  mechanism: HumorMechanism
  market: Market
  trendLevel: number
  businessTypes: BusinessType[]
  hasScript: boolean
  script_mode?: ScriptMode
  setup_complexity?: SigmaSetupComplexity | null
  skill_required?: SigmaSkillLevel | null
  setting?: SigmaBackdrop | null
  estimatedBudget: EstimatedBudget
  vibeAlignments: string[]
  whyItFits: string[]
  price: number
  isNew?: boolean
  remaining?: number
  sourceUrl?: string
  gcsUri?: string
  headline_sv?: string
  description_sv?: string
  whyItWorks_sv?: string
  script_sv?: string
  productionNotes_sv?: string[]
  whyItFits_sv?: string[]
}

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
  difficulty?: Difficulty
  filmTime?: FilmTime
  market?: Market
  peopleNeeded?: PeopleNeeded
  mechanism?: HumorMechanism
  trendLevel?: number
  businessTypes?: BusinessType[]
  hasScript?: boolean
  estimatedBudget?: EstimatedBudget
  transcript?: string
  // V1 contract additions — set by upload-confirm or library edit
  script_mode?: ScriptMode
  // V1 objective signals — from sigma_taste, confirmed by CM at ingest
  setup_complexity?: SigmaSetupComplexity
  skill_required?: SigmaSkillLevel
  setting?: SigmaBackdrop
}

/**
 * Read the script_mode for a concept.
 * Checks overrides.script_mode first (V1 contract), then falls back to
 * inferring from the legacy hasScript boolean and available transcript data.
 * Safe to call on old concepts that have neither field.
 */
export function readScriptMode(clip: BackendClip, override?: ClipOverride): ScriptMode {
  if (override?.script_mode) return override.script_mode

  // Infer from sigma narrative signals when available
  const sigma = getSigma(clip)
  const beatType = sigma.narrative_flow?.beat_progression?.type
  if (beatType === 'dialogue_escalation') return 'long_dialogue'

  const hookStyle = sigma.hook_analysis?.hook_style
  if (hookStyle === 'text_overlay') return 'text_overlay'

  // Fall back to legacy hasScript inference
  const hasScript = override?.hasScript ?? (clip.script?.hasScript ?? false)
  const hasTranscript = Boolean(
    clip.script?.transcript?.trim() || clip.script?.conceptCore?.trim(),
  )

  if (!hasScript && !hasTranscript) {
    // Check if scene_breakdown suggests visual-only
    const hasAudio = clip.scene_breakdown?.some(
      (scene) => scene.audio && scene.audio.trim().length > 0,
    )
    return hasAudio ? 'none' : 'visual_only'
  }

  if (hasTranscript) {
    const transcript = (clip.script?.transcript ?? '').toLowerCase()
    const wordCount = transcript.split(/\s+/).filter(Boolean).length
    return wordCount > 60 ? 'long_dialogue' : 'short_dialogue'
  }

  return 'none'
}

/**
 * Read the setup_complexity for a concept.
 * Checks overrides first (V1 contract), then sigma replicability_decomposed.
 * Returns null when no signal is available (old concepts without sigma).
 */
export function readSetupComplexity(clip: BackendClip, override?: ClipOverride): SigmaSetupComplexity | null {
  if (override?.setup_complexity) return override.setup_complexity
  const sigma = getSigma(clip)
  return sigma.replicability_decomposed?.environment_requirements?.setup_complexity ?? null
}

/**
 * Read the skill_required for a concept.
 * Checks overrides first, then sigma actor_requirements.skill_level.
 */
export function readSkillRequired(clip: BackendClip, override?: ClipOverride): SigmaSkillLevel | null {
  if (override?.skill_required) return override.skill_required
  const sigma = getSigma(clip)
  return sigma.replicability_decomposed?.actor_requirements?.skill_level ?? null
}

/**
 * Read the setting (backdrop interchangeability) for a concept.
 * Checks overrides first, then sigma environment_requirements.backdrop_interchangeability.
 */
export function readSetting(clip: BackendClip, override?: ClipOverride): SigmaBackdrop | null {
  if (override?.setting) return override.setting
  const sigma = getSigma(clip)
  return sigma.replicability_decomposed?.environment_requirements?.backdrop_interchangeability ?? null
}

export interface ClipDefaults {
  headline_sv: string
  description_sv: string
  whyItWorks_sv: string
  script_sv: string
  productionNotes_sv: string[]
  whyItFits_sv: string[]
}

const BUSINESS_TYPES: BusinessType[] = [
  'bar',
  'restaurang',
  'cafe',
  'bistro',
  'hotell',
  'foodtruck',
  'nattklubb',
  'bageri',
]

function clampTrendLevel(value: number | undefined | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 3
  return Math.max(1, Math.min(5, Math.round(value)))
}

function compactLines(value: string) {
  return value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

function trimToSentence(value: string, maxLength = 140) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trim()}…`
}

function firstNonEmpty(...values: Array<string | undefined | null>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function searchText(clip: BackendClip) {
  return [
    clip.url,
    clip.source_url,
    clip.origin_country,
    clip.humor_analysis?.mechanism,
    clip.humor_analysis?.why,
    clip.humor_analysis?.target_audience,
    clip.replicability_analysis,
    clip.replicability?.replicability_notes,
    clip.script?.conceptCore,
    clip.script?.transcript,
    clip.scene_breakdown?.map((scene) => `${scene.audio} ${scene.visual} ${scene.narrative_function}`).join(' '),
  ]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .join(' ')
    .toLowerCase()
}

function buildDescription(clip: BackendClip, businessTypes: BusinessType[]) {
  // Prefer v7.B tuned handlingSummary as the primary description when available
  const tunedHandling = clip.script?.humor?.handlingSummary
  if (typeof tunedHandling === 'string' && tunedHandling.trim()) {
    return trimToSentence(tunedHandling, 200)
  }

  const concept = firstNonEmpty(clip.script?.conceptCore, clip.script?.transcript)
  const segment =
    businessTypes[0] === 'bar'
      ? 'bar eller servering'
      : businessTypes[0] === 'cafe'
        ? 'café eller kaffemiljö'
        : businessTypes[0] === 'bageri'
          ? 'bageri eller disk'
          : 'restaurangmiljö'

  if (concept) {
    return trimToSentence(`${concept}. Anpassa det till din ${segment} och filma samma upplägg med eget team eller egen produkt.`)
  }

  const sceneAudio = firstNonEmpty(clip.scene_breakdown?.[0]?.audio, clip.scene_breakdown?.[0]?.visual)
  if (sceneAudio) {
    return trimToSentence(`Bygg videon runt "${sceneAudio}" och anpassa scenen till din ${segment}.`)
  }

  return `Ett kort socialt format att spela in i din ${segment} med tydlig hook och enkel payoff.`
}

function buildWhyItWorks(
  clip: BackendClip,
  mechanism: HumorMechanism,
  hasScript: boolean,
  businessTypes: BusinessType[],
) {
  // Prefer v7.B tuned humor fields when present (set by the async humor-enrich pass)
  const tunedWhyItWorks = clip.script?.humor?.whyItWorks
  if (typeof tunedWhyItWorks === 'string' && tunedWhyItWorks.trim()) {
    return trimToSentence(tunedWhyItWorks, 220)
  }

  // Prefer σTaste reasoning fields over legacy free-text when available
  const sigma = getSigma(clip)
  const why = firstNonEmpty(
    sigma.content_classification?.classification_reasoning,
    sigma.replicability_decomposed?.one_to_one_copy_feasibility?.reasoning,
    sigma.narrative_flow?.coherence_notes,
    clip.humor_analysis?.why,
    clip.replicability_analysis,
  )
  if (why) {
    return trimToSentence(why, 220)
  }

  const businessLabel =
    businessTypes.includes('bar') || businessTypes.includes('nattklubb')
      ? 'bar- och restaurangmiljöer'
      : businessTypes.includes('cafe') || businessTypes.includes('bageri')
        ? 'kafé- och servicevardag'
        : 'servicebranschen'

  const mechanismText =
    mechanism === 'contrast'
      ? 'kontrasten mellan förväntan och verklighet'
      : mechanism === 'recognition'
        ? 'igenkänningen i situationen'
        : mechanism === 'deadpan'
          ? 'den torra leveransen'
          : mechanism === 'escalation'
            ? 'eskaleringen i varje beat'
            : mechanism === 'absurdism'
              ? 'det absurda i upplägget'
              : 'twisten i payoffen'

  return trimToSentence(
    `Formatet fungerar eftersom ${mechanismText} är lätt att förstå direkt i flödet och känns relaterbar för ${businessLabel}.${hasScript ? ' Det finns dessutom ett tydligt manus att följa i produktion.' : ''}`,
    220,
  )
}

function buildScript(clip: BackendClip) {
  const transcript = compactLines(firstNonEmpty(clip.script?.transcript))
  if (transcript) {
    return transcript
  }

  if (clip.scene_breakdown?.length) {
    return clip.scene_breakdown
      .map((scene, index) => {
        const audio = scene.audio?.trim()
        const visual = scene.visual?.trim()
        const lines = [`[SCEN ${index + 1}: ${scene.narrative_function || 'beat'}]`]
        if (audio) lines.push(audio)
        if (visual) lines.push(`Bild: ${visual}`)
        return lines.join('\n')
      })
      .join('\n\n')
  }

  const concept = firstNonEmpty(clip.script?.conceptCore)
  if (concept) {
    return `[HOOK]\n${concept}\n\n[PAYOFF]\nVisa twisten tydligt och håll tempot högt.`
  }

  return ''
}

function buildProductionNotes(
  clip: BackendClip,
  filmTime: FilmTime,
  peopleNeeded: PeopleNeeded,
  businessTypes: BusinessType[],
) {
  const notes = new Set<string>()

  notes.add('Filma vertikalt och håll första bilden tydlig redan från sekund ett.')

  if (clip.scene_breakdown?.length) {
    notes.add(`Planera ${Math.min(clip.scene_breakdown.length, 4)} korta beats så att hook och payoff kommer snabbt.`)
  } else {
    notes.add('Bygg videon i 2-4 korta beats: hook, setup och payoff.')
  }

  if (peopleNeeded === 'solo') {
    notes.add('Ställ mobilen stabilt och spela in själv med enkel blocking framför kameran.')
  } else if (peopleNeeded === 'duo') {
    notes.add('Sätt rollerna innan ni filmar så att reaktion och payoff blir skarpa på första tagningen.')
  } else {
    notes.add('Fördela roller och positioner innan inspelning så att tempot inte tappar fart mellan tagningarna.')
  }

  if (businessTypes.includes('bar') || businessTypes.includes('nattklubb')) {
    notes.add('Filma nära baren eller serveringsytan så att miljön känns äkta direkt.')
  } else if (businessTypes.includes('cafe') || businessTypes.includes('bageri')) {
    notes.add('Använd disk, kaffemaskin eller bakbord som tydlig spelplats i bild.')
  } else {
    notes.add('Lägg scenen där gästmöte eller servering syns tydligt i första klippet.')
  }

  if (filmTime === '1hr' || filmTime === '1hr_plus' || filmTime === '30min') {
    notes.add('Avsätt tid för flera tagningar och enkel klippning så att payoffen landar tydligt.')
  } else {
    notes.add('Håll produktionen enkel: filma allt i ett kort pass och klipp med raka cuts.')
  }

  return Array.from(notes).slice(0, 5)
}

function translateDifficulty(clip: BackendClip): Difficulty {
  const sigma = getSigma(clip)
  const copyScore = sigma.replicability_decomposed?.one_to_one_copy_feasibility?.score
  if (copyScore === 3) return 'easy'
  if (copyScore === 2) return 'medium'
  if (copyScore === 1) return 'advanced'

  const skillLevel = sigma.replicability_decomposed?.actor_requirements?.skill_level
  if (skillLevel === 'anyone' || skillLevel === 'comfortable_on_camera') return 'easy'
  if (skillLevel === 'acting_required') return 'medium'
  if (skillLevel === 'professional') return 'advanced'

  const editing = sigma.replicability_decomposed?.production_requirements?.editing_skill
  if (editing === 'professional_post' || editing === 'effects_required') return 'advanced'

  if (clip.replicability_signals?.skill_requirements !== undefined) {
    const skill = clip.replicability_signals.skill_requirements
    if (skill >= 8) return 'easy'
    if (skill >= 5) return 'medium'
    return 'advanced'
  }

  if (clip.replicability?.execution_skill !== undefined) {
    const skill = clip.replicability.execution_skill
    if (skill <= 3) return 'easy'
    if (skill <= 5) return 'medium'
    return 'advanced'
  }

  const notes = searchText(clip)
  if (notes.includes('simple') || notes.includes('enkel') || notes.includes('smartphone')) {
    return 'easy'
  }

  return 'medium'
}

function translatePeopleNeeded(clip: BackendClip): PeopleNeeded {
  const sigma = getSigma(clip)
  const actorCount = sigma.replicability_decomposed?.actor_requirements?.count
  if (actorCount === 'solo') return 'solo'
  if (actorCount === 'duo') return 'duo'
  if (actorCount === 'small_group') return 'small_team'
  if (actorCount === 'crowd') return 'team'

  const combined = searchText(clip)
  const talentRequirement = clip.replicability?.talent_requirement

  if (combined.includes('4+') || combined.includes('fyra') || combined.includes('team')) return 'team'
  if (combined.includes('tre') || combined.includes('three') || combined.includes('3 personer')) return 'small_team'
  if (
    combined.includes('två') ||
    combined.includes('two') ||
    combined.includes('2 personer') ||
    combined.includes('bartender och') ||
    combined.includes('kund och')
  ) {
    return 'duo'
  }

  if (typeof talentRequirement === 'number') {
    if (talentRequirement >= 8) return 'team'
    if (talentRequirement >= 6) return 'small_team'
    if (talentRequirement >= 4) return 'duo'
  }

  return 'solo'
}

function translateFilmTime(clip: BackendClip): FilmTime {
  const sigma = getSigma(clip)
  const estimated = sigma.replicability_decomposed?.production_requirements?.estimated_time
  if (estimated === 'under_15min') return '10min'
  if (estimated === 'under_1hr') return '30min'
  if (estimated === 'half_day') return '1hr'
  if (estimated === 'full_day_plus') return '1hr_plus'

  if (clip.replicability_signals?.time_investment !== undefined) {
    const time = clip.replicability_signals.time_investment
    if (time >= 9) return '5min'
    if (time >= 7) return '10min'
    if (time >= 5) return '15min'
    if (time >= 4) return '20min'
    if (time >= 3) return '30min'
    if (time >= 2) return '1hr'
    return '1hr_plus'
  }

  if (clip.replicability?.timing_complexity !== undefined) {
    const complexity = clip.replicability.timing_complexity
    if (complexity <= 2) return '5min'
    if (complexity <= 4) return '15min'
    if (complexity <= 5) return '20min'
    if (complexity <= 6) return '30min'
    if (complexity <= 8) return '1hr'
    return '1hr_plus'
  }

  return '15min'
}

function translateMechanism(clip: BackendClip): HumorMechanism {
  // Prefer v7.B tuned humorMechanism when present
  const tunedMechanism = clip.script?.humor?.humorMechanism
  if (typeof tunedMechanism === 'string' && tunedMechanism.trim()) {
    const m = tunedMechanism.toLowerCase()
    if (m.includes('contrast')) return 'contrast'
    if (m.includes('recognition') || m.includes('relatable') || m.includes('igenk')) return 'recognition'
    if (m.includes('dark')) return 'dark'
    if (m.includes('escalat')) return 'escalation'
    if (m.includes('deadpan') || m.includes('torr')) return 'deadpan'
    if (m.includes('absurd')) return 'absurdism'
    if (m.includes('subversion') || m.includes('subvers') || m.includes('twist')) return 'subversion'
  }

  // Prefer σTaste-derived signals over legacy free-text humor fields when present
  const sigma = getSigma(clip)
  const payoff = sigma.payoff_analysis?.payoff_type
  if (payoff === 'twist' || payoff === 'callback') return 'subversion'
  if (payoff === 'escalation_peak') return 'escalation'
  const beat = sigma.narrative_flow?.beat_progression?.type
  if (beat === 'incremental_heightening' || beat === 'dialogue_escalation') return 'escalation'
  const story = sigma.narrative_flow?.story_direction
  if (story === 'escalating') return 'escalation'
  if (story === 'revelation_based') return 'subversion'
  const hookStyle = sigma.hook_analysis?.hook_style
  if (hookStyle === 'relatable_situation') return 'recognition'
  const strata = sigma.content_classification?.strata_id
  if (strata === 'workplace_relatable' || strata === 'customer_interaction') return 'recognition'

  // Legacy fallback: humor_analysis.mechanism free-text
  const mechanism = firstNonEmpty(clip.humor_analysis?.mechanism).toLowerCase()
  if (mechanism.includes('contrast')) return 'contrast'
  if (mechanism.includes('recognition') || mechanism.includes('relatable') || mechanism.includes('igenk')) return 'recognition'
  if (mechanism.includes('dark')) return 'dark'
  if (mechanism.includes('escalat')) return 'escalation'
  if (mechanism.includes('deadpan') || mechanism.includes('torr')) return 'deadpan'
  if (mechanism.includes('absurd')) return 'absurdism'

  return 'subversion'
}

function translateTrendLevel(clip: BackendClip) {
  const handling = firstNonEmpty(clip.humor_analysis?.handling).toLowerCase()
  if (handling.includes('good')) return 4
  if (handling.includes('bad')) return 2
  if (handling.includes('viral')) return 5
  return 3
}

function translateMarket(clip: BackendClip): Market {
  const combined = searchText(clip)
  if (combined.includes('stockholm') || combined.includes('sweden') || /[åäö]/i.test(combined)) return 'SE'
  if (combined.includes('london') || combined.includes('uk') || combined.includes('brit') || combined.includes('england')) return 'UK'
  return 'US'
}

function translateBusinessTypes(clip: BackendClip): BusinessType[] {
  const sigma = getSigma(clip)
  const strata = sigma.content_classification?.strata_id
  const combined = searchText(clip)
  const result = new Set<BusinessType>()
  if (strata === 'product_showcase' || strata === 'customer_interaction') {
    result.add('restaurang')
  }
  if (strata === 'atmosphere_vibe') {
    result.add('bar')
    result.add('nattklubb')
  }

  const matches = (patterns: string[]) => patterns.some((pattern) => combined.includes(pattern))

  if (matches(['bar', 'bartender', 'cocktail', 'pub', 'drink', 'shots'])) result.add('bar')
  if (matches(['restaurant', 'restaurang', 'servitör', 'servitris', 'kock', 'kök', 'mat', 'bord ', 'servering'])) {
    result.add('restaurang')
  }
  if (matches(['café', 'cafe', 'coffee', 'kaffe', 'barista', 'espresso', 'latte'])) result.add('cafe')
  if (matches(['bistro'])) result.add('bistro')
  if (matches(['hotell', 'hotel', 'lobby', 'reception', 'room service'])) result.add('hotell')
  if (matches(['foodtruck', 'food truck', 'truck'])) result.add('foodtruck')
  if (matches(['nattklubb', 'nightclub', 'club'])) result.add('nattklubb')
  if (matches(['bageri', 'bakery', 'croissant', 'bakbord', 'bröd', 'pastry'])) result.add('bageri')

  if (result.size === 0) {
    if (clip.audience_signals?.vibe_alignments?.includes('foodies')) {
      result.add('restaurang')
      result.add('cafe')
    } else {
      result.add('restaurang')
    }
  }

  return BUSINESS_TYPES.filter((type) => result.has(type)).slice(0, 3)
}

function translateBudget(clip: BackendClip, difficulty: Difficulty, filmTime: FilmTime): EstimatedBudget {
  const sigma = getSigma(clip)
  const setup = sigma.replicability_decomposed?.environment_requirements?.setup_complexity
  const propLevel = sigma.replicability_decomposed?.environment_requirements?.prop_dependency?.level
  if (setup === 'elaborate_staging' || propLevel === 'custom_fabrication') return 'high'
  if (setup === 'multi_location' || propLevel === 'specific_props') return 'medium'
  if (setup === 'basic_tripod' || propLevel === 'common_items') return 'low'
  if (setup === 'point_and_shoot' && (propLevel === 'none' || !propLevel)) return 'free'

  const budgetSignal = clip.replicability_signals?.budget_requirements
  if (typeof budgetSignal === 'number') {
    if (budgetSignal <= 2) return 'free'
    if (budgetSignal <= 4) return 'low'
    if (budgetSignal <= 7) return 'medium'
    return 'high'
  }

  const equipmentSignal = clip.replicability_signals?.equipment_requirements
  if (typeof equipmentSignal === 'number') {
    if (equipmentSignal <= 2) return 'free'
    if (equipmentSignal <= 4) return 'low'
    if (equipmentSignal <= 7) return 'medium'
    return 'high'
  }

  if (difficulty === 'advanced' || filmTime === '1hr' || filmTime === '1hr_plus') {
    return 'medium'
  }

  return 'low'
}

function translateHasScript(clip: BackendClip) {
  if (typeof clip.script?.hasScript === 'boolean') {
    return clip.script.hasScript
  }
  if (firstNonEmpty(clip.script?.transcript, clip.script?.conceptCore)) {
    return true
  }
  if (Boolean(clip.scene_breakdown?.length)) return true
  const sigma = getSigma(clip)
  const beat = sigma.narrative_flow?.beat_progression?.type
  if (beat === 'dialogue_escalation') return true
  return false
}

function translateVibes(clip: BackendClip) {
  return clip.audience_signals?.vibe_alignments || []
}

function translateWhyItFits(
  businessTypes: BusinessType[],
  filmTime: FilmTime,
  peopleNeeded: PeopleNeeded,
  estimatedBudget: EstimatedBudget,
) {
  const reasons: string[] = []

  if (businessTypes.includes('bar') || businessTypes.includes('nattklubb')) {
    reasons.push('Passar starkt för bar- och kvällsmiljö där tempo och personlighet säljer.')
  }
  if (businessTypes.includes('restaurang')) {
    reasons.push('Fungerar bra i restaurangmiljö där service, gästmöten eller kök redan ger tydliga scener.')
  }
  if (businessTypes.includes('cafe') || businessTypes.includes('bageri')) {
    reasons.push('Lätt att anpassa till café- eller bageridisk med små medel och tydlig vardagskänsla.')
  }
  if (filmTime === '5min' || filmTime === '10min' || filmTime === '15min') {
    reasons.push('Snabbt att spela in utan att störa driften särskilt mycket.')
  }
  if (peopleNeeded === 'solo') {
    reasons.push('Kan filmas av en person med enkel setup.')
  } else if (peopleNeeded === 'duo') {
    reasons.push('Kräver bara två personer för att få hook och payoff att landa.')
  }
  if (estimatedBudget === 'free' || estimatedBudget === 'low') {
    reasons.push('Formatet går att producera med låg budget och vanlig mobilkamera.')
  }

  if (reasons.length === 0) {
    reasons.push('Formatet är lätt att förstå direkt och går snabbt att anpassa till kundens vardag.')
  }

  return reasons.slice(0, 3)
}

function translateHeadline(clip: BackendClip) {
  const conceptCore = firstNonEmpty(clip.script?.conceptCore)
  if (conceptCore) return trimToSentence(conceptCore, 60)

  const sceneAudio = firstNonEmpty(clip.scene_breakdown?.[0]?.audio)
  if (sceneAudio) return trimToSentence(sceneAudio, 60)

  return 'Nytt koncept'
}

export function translateClipToConcept(
  clip: BackendClip,
  override?: ClipOverride,
  defaults?: ClipDefaults,
): TranslatedConcept {
  const difficulty = override?.difficulty ?? translateDifficulty(clip)
  const filmTime = override?.filmTime ?? translateFilmTime(clip)
  const peopleNeeded = override?.peopleNeeded ?? translatePeopleNeeded(clip)
  const mechanism = override?.mechanism ?? translateMechanism(clip)
  const market = override?.market ?? translateMarket(clip)
  const trendLevel = clampTrendLevel(override?.trendLevel ?? translateTrendLevel(clip))
  const businessTypes = (override?.businessTypes?.filter(Boolean) as BusinessType[] | undefined) ?? translateBusinessTypes(clip)
  const hasScript = override?.hasScript ?? translateHasScript(clip)
  const script_mode = readScriptMode(clip, override)
  const setup_complexity = readSetupComplexity(clip, override)
  const skill_required = readSkillRequired(clip, override)
  const setting = readSetting(clip, override)
  const estimatedBudget = override?.estimatedBudget ?? translateBudget(clip, difficulty, filmTime)
  const autoScript = buildScript(clip)
  const whyItFits = override?.whyItFits_sv || defaults?.whyItFits_sv || translateWhyItFits(businessTypes, filmTime, peopleNeeded, estimatedBudget)

  return {
    id: clip.id,
    headline: override?.headline_sv || translateHeadline(clip),
    matchPercentage: override?.matchPercentage ?? 85,
    difficulty,
    filmTime,
    peopleNeeded,
    mechanism,
    market,
    trendLevel,
    businessTypes,
    hasScript,
    script_mode,
    setup_complexity,
    skill_required,
    setting,
    estimatedBudget,
    vibeAlignments: translateVibes(clip),
    whyItFits,
    price: override?.price ?? 24,
    isNew: override?.isNew,
    remaining: override?.remaining,
    sourceUrl: clip.source_url ?? clip.url,
    gcsUri: clip.gcs_uri,
    headline_sv: override?.headline_sv || defaults?.headline_sv || translateHeadline(clip),
    description_sv: override?.description_sv || defaults?.description_sv || buildDescription(clip, businessTypes),
    whyItWorks_sv: override?.whyItWorks_sv || defaults?.whyItWorks_sv || buildWhyItWorks(clip, mechanism, hasScript, businessTypes),
    script_sv: override?.script_sv || override?.transcript || defaults?.script_sv || autoScript,
    productionNotes_sv:
      override?.productionNotes_sv ||
      defaults?.productionNotes_sv ||
      buildProductionNotes(clip, filmTime, peopleNeeded, businessTypes),
    whyItFits_sv: whyItFits,
  }
}

export function translateClips(
  clips: BackendClip[],
  overridesMap?: Record<string, ClipOverride>,
  defaults?: ClipDefaults,
) {
  return clips.map((clip) => translateClipToConcept(clip, overridesMap?.[clip.id], defaults))
}
