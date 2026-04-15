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
  const why = firstNonEmpty(clip.humor_analysis?.why, clip.replicability_analysis)
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
  const combined = searchText(clip)
  const result = new Set<BusinessType>()

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
  return Boolean(clip.scene_breakdown?.length)
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
