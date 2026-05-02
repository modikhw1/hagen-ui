import { z } from 'zod'
import type { BusinessType, Difficulty, EstimatedBudget, FilmTime, HumorMechanism, Market, PeopleNeeded } from './display'
import { translateClipToConcept, type BackendClip, type ClipOverride } from './translator'

export const BUSINESS_TYPE_VALUES = [
  'bar',
  'restaurang',
  'cafe',
  'bistro',
  'hotell',
  'foodtruck',
  'nattklubb',
  'bageri',
] as const satisfies readonly BusinessType[]

export const FILM_TIME_VALUES = [
  '5min',
  '10min',
  '15min',
  '20min',
  '30min',
  '1hr',
  '1hr_plus',
] as const satisfies readonly FilmTime[]

export const PEOPLE_VALUES = ['solo', 'duo', 'small_team', 'team'] as const satisfies readonly PeopleNeeded[]
export const DIFFICULTY_VALUES = ['easy', 'medium', 'advanced'] as const satisfies readonly Difficulty[]
export const MECHANISM_VALUES = [
  'subversion',
  'contrast',
  'recognition',
  'dark',
  'escalation',
  'deadpan',
  'absurdism',
] as const satisfies readonly HumorMechanism[]
export const MARKET_VALUES = ['SE', 'US', 'UK'] as const satisfies readonly Market[]
export const BUDGET_VALUES = ['free', 'low', 'medium', 'high'] as const satisfies readonly EstimatedBudget[]

export const enrichedConceptSchema = z.object({
  headline_sv: z.string().min(1).max(120),
  description_sv: z.string().min(1).max(400),
  whyItWorks_sv: z.string().min(1).max(500),
  script_sv: z.string().min(1).max(4000),
  productionNotes_sv: z.array(z.string().min(1).max(220)).min(1).max(5),
  whyItFits_sv: z.array(z.string().min(1).max(220)).min(1).max(4),
  difficulty: z.enum(DIFFICULTY_VALUES),
  filmTime: z.enum(FILM_TIME_VALUES),
  peopleNeeded: z.enum(PEOPLE_VALUES),
  mechanism: z.enum(MECHANISM_VALUES),
  market: z.enum(MARKET_VALUES),
  trendLevel: z.number().min(1).max(5),
  businessTypes: z.array(z.enum(BUSINESS_TYPE_VALUES)).min(1).max(3),
  hasScript: z.boolean(),
  estimatedBudget: z.enum(BUDGET_VALUES),
})

export type EnrichedConceptOverride = z.infer<typeof enrichedConceptSchema> & ClipOverride

export const ENRICH_CONCEPT_SYSTEM_PROMPT = `Du är en innehållsstrateg för svenska restauranger, barer, caféer och hotell.

Du får analysdata för ett videokoncept och ska returnera strukturerad JSON för LeTrends konceptbibliotek.

Regler:
- All text ska vara på svenska.
- headline_sv: max 60 tecken, konkret och säljbar, inte generisk.
- description_sv: 1-2 meningar om vad kunden faktiskt ska filma.
- whyItWorks_sv: 2-3 meningar om varför formatet engagerar och varför det passar hospitality.
- script_sv: använd befintligt transkript om det finns, annars skriv ett föreslaget manus.
- productionNotes_sv: 3-5 tydliga steg som går att följa i produktion.
- whyItFits_sv: 2-3 korta argument som hjälper en CM att motivera konceptet till kund.
- businessTypes: välj 1-3 av [bar, restaurang, cafe, bistro, hotell, foodtruck, nattklubb, bageri].
- difficulty: easy, medium eller advanced.
- filmTime: 5min, 10min, 15min, 20min, 30min, 1hr eller 1hr_plus.
- peopleNeeded: solo, duo, small_team eller team.
- mechanism: subversion, contrast, recognition, dark, escalation, deadpan eller absurdism.
- market: SE, US eller UK.
- trendLevel: 1-5.
- estimatedBudget: free, low, medium eller high.
- hasScript ska vara true om konceptet har ett tydligt manus eller tydliga repliker att följa.`

export const ENRICH_CONCEPT_TOOL = {
  type: 'function',
  function: {
    name: 'enrich_concept',
    description: 'Return structured concept data for the concept library',
    parameters: {
      type: 'object',
      properties: {
        headline_sv: { type: 'string' },
        description_sv: { type: 'string' },
        whyItWorks_sv: { type: 'string' },
        script_sv: { type: 'string' },
        productionNotes_sv: { type: 'array', items: { type: 'string' } },
        whyItFits_sv: { type: 'array', items: { type: 'string' } },
        difficulty: { type: 'string', enum: DIFFICULTY_VALUES },
        filmTime: { type: 'string', enum: FILM_TIME_VALUES },
        peopleNeeded: { type: 'string', enum: PEOPLE_VALUES },
        mechanism: { type: 'string', enum: MECHANISM_VALUES },
        market: { type: 'string', enum: MARKET_VALUES },
        trendLevel: { type: 'number' },
        businessTypes: { type: 'array', items: { type: 'string', enum: BUSINESS_TYPE_VALUES } },
        hasScript: { type: 'boolean' },
        estimatedBudget: { type: 'string', enum: BUDGET_VALUES },
      },
      required: [
        'headline_sv',
        'description_sv',
        'whyItWorks_sv',
        'script_sv',
        'productionNotes_sv',
        'whyItFits_sv',
        'difficulty',
        'filmTime',
        'peopleNeeded',
        'mechanism',
        'market',
        'trendLevel',
        'businessTypes',
        'hasScript',
        'estimatedBudget',
      ],
      additionalProperties: false,
    },
  },
} as const

function dedupeStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }

  return result
}

export function buildFallbackEnrichedConcept(backendData: BackendClip): EnrichedConceptOverride {
  const translated = translateClipToConcept(backendData)

  return {
    headline_sv: translated.headline_sv || translated.headline,
    description_sv: translated.description_sv || '',
    whyItWorks_sv: translated.whyItWorks_sv || '',
    script_sv: translated.script_sv || '',
    productionNotes_sv: translated.productionNotes_sv || [],
    whyItFits_sv: translated.whyItFits_sv || translated.whyItFits,
    difficulty: translated.difficulty,
    filmTime: translated.filmTime,
    peopleNeeded: translated.peopleNeeded,
    mechanism: translated.mechanism,
    market: translated.market === 'global' ? 'US' : translated.market,
    trendLevel: translated.trendLevel,
    businessTypes: translated.businessTypes,
    hasScript: translated.hasScript,
    estimatedBudget: translated.estimatedBudget,
  }
}

export function normalizeEnrichedConcept(input: unknown, backendData: BackendClip): EnrichedConceptOverride {
  const fallback = buildFallbackEnrichedConcept(backendData)
  const candidate = typeof input === 'object' && input ? (input as Record<string, unknown>) : {}

  const normalized = {
    headline_sv: typeof candidate.headline_sv === 'string' ? candidate.headline_sv.trim() : fallback.headline_sv,
    description_sv:
      typeof candidate.description_sv === 'string' ? candidate.description_sv.trim() : fallback.description_sv,
    whyItWorks_sv:
      typeof candidate.whyItWorks_sv === 'string' ? candidate.whyItWorks_sv.trim() : fallback.whyItWorks_sv,
    script_sv: typeof candidate.script_sv === 'string' ? candidate.script_sv.trim() : fallback.script_sv,
    productionNotes_sv: dedupeStrings(candidate.productionNotes_sv).slice(0, 5),
    whyItFits_sv: dedupeStrings(candidate.whyItFits_sv).slice(0, 4),
    difficulty: candidate.difficulty,
    filmTime: candidate.filmTime,
    peopleNeeded: candidate.peopleNeeded,
    mechanism: candidate.mechanism,
    market: candidate.market,
    trendLevel: typeof candidate.trendLevel === 'number' ? candidate.trendLevel : fallback.trendLevel,
    businessTypes: dedupeStrings(candidate.businessTypes).slice(0, 3),
    hasScript: typeof candidate.hasScript === 'boolean' ? candidate.hasScript : fallback.hasScript,
    estimatedBudget: candidate.estimatedBudget,
  }

  const parsed = enrichedConceptSchema.safeParse({
    ...fallback,
    ...normalized,
    productionNotes_sv: normalized.productionNotes_sv.length ? normalized.productionNotes_sv : fallback.productionNotes_sv,
    whyItFits_sv: normalized.whyItFits_sv.length ? normalized.whyItFits_sv : fallback.whyItFits_sv,
    businessTypes: normalized.businessTypes.length ? normalized.businessTypes : fallback.businessTypes,
  })

  return parsed.success ? parsed.data : fallback
}
