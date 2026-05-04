/**
 * POST /api/studio/concepts/enrich
 *
 * Studio ingest step 2 — given the raw backend analysis object produced by
 * /api/studio/concepts/analyze, call Gemini with function-calling to generate
 * Swedish-language concept metadata for LeTrend's concept library.
 *
 * Uses the exact same system prompt and tool schema as the letrend frontend
 * (letrend/src/lib/concept-enrichment.ts) so both sides stay in sync.
 *
 * Request body: { backend_data: Record<string, unknown> }
 * Response:     { overrides: EnrichedConcept }
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  GoogleGenerativeAI,
  SchemaType,
  type Tool,
  type FunctionDeclaration,
} from '@google/generative-ai'

export const maxDuration = 45

// ── Enumerations (exact mirror of letrend/src/lib/concept-enrichment.ts) ──

const DIFFICULTY_VALUES = ['easy', 'medium', 'advanced'] as const
const FILM_TIME_VALUES = [
  '5min', '10min', '15min', '20min', '30min', '1hr', '1hr_plus',
] as const
const PEOPLE_VALUES = ['solo', 'duo', 'small_team', 'team'] as const
const MECHANISM_VALUES = [
  'subversion', 'contrast', 'recognition', 'dark', 'escalation', 'deadpan', 'absurdism',
] as const
const MARKET_VALUES = ['SE', 'US', 'UK'] as const
const BUDGET_VALUES = ['free', 'low', 'medium', 'high'] as const
const BUSINESS_TYPE_VALUES = [
  'bar', 'restaurang', 'cafe', 'bistro', 'hotell', 'foodtruck', 'nattklubb', 'bageri',
] as const

type DifficultyValue = typeof DIFFICULTY_VALUES[number]
type FilmTimeValue = typeof FILM_TIME_VALUES[number]
type PeopleValue = typeof PEOPLE_VALUES[number]
type MechanismValue = typeof MECHANISM_VALUES[number]
type MarketValue = typeof MARKET_VALUES[number]
type BudgetValue = typeof BUDGET_VALUES[number]
type BusinessTypeValue = typeof BUSINESS_TYPE_VALUES[number]

interface EnrichedConcept {
  headline_sv: string
  description_sv: string
  whyItWorks_sv: string
  script_sv: string
  productionNotes_sv: string[]
  whyItFits_sv: string[]
  difficulty: DifficultyValue
  filmTime: FilmTimeValue
  peopleNeeded: PeopleValue
  mechanism: MechanismValue
  market: MarketValue
  trendLevel: number
  businessTypes: BusinessTypeValue[]
  hasScript: boolean
  estimatedBudget: BudgetValue
}

// ── System prompt (exact copy of ENRICH_CONCEPT_SYSTEM_PROMPT) ─────────────

const ENRICH_CONCEPT_SYSTEM_PROMPT = `Du är en innehållsstrateg för svenska restauranger, barer, caféer och hotell.

Du får analysdata för ett videokoncept och ska returnera strukturerad JSON för LeTrends konceptbibliotek.

SCRIPT-NOTATION — markera varje rad i script_sv med rätt prefix:
- [Dialog]: tal/replik som sägs av en person
- [Textoverlay]: text som visas på skärmen (text card, caption, overlay)
- [Visuell]: rent visuell scen utan tal eller textoverlay
Kombinera typer när de förekommer i samma video.

Regler:
- All text ska vara på svenska.
- headline_sv: max 60 tecken, konkret och säljbar, inte generisk.
- description_sv: 1-2 meningar om vad kunden faktiskt ska filma.
- whyItWorks_sv: 2-3 meningar om varför formatet engagerar och varför det passar hospitality.
- script_sv: använd befintligt transkript om det finns, annars skriv ett föreslaget manus med rätt notation.
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

// ── Tool definition (mirrors ENRICH_CONCEPT_TOOL from letrend) ─────────────
// Use SchemaType enum so values match the Google AI SDK's expected literals.

const enrichFunctionDeclaration: FunctionDeclaration = {
  name: 'enrich_concept',
  description: 'Return structured concept data for the concept library',
  // Cast through unknown: the SDK's internal FunctionDeclarationSchema type is
  // structurally equivalent at runtime; the cast avoids a version-locked import.
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      headline_sv:        { type: SchemaType.STRING },
      description_sv:     { type: SchemaType.STRING },
      whyItWorks_sv:      { type: SchemaType.STRING },
      script_sv:          { type: SchemaType.STRING },
      productionNotes_sv: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      whyItFits_sv:       { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      difficulty:         { type: SchemaType.STRING, enum: [...DIFFICULTY_VALUES] },
      filmTime:           { type: SchemaType.STRING, enum: [...FILM_TIME_VALUES] },
      peopleNeeded:       { type: SchemaType.STRING, enum: [...PEOPLE_VALUES] },
      mechanism:          { type: SchemaType.STRING, enum: [...MECHANISM_VALUES] },
      market:             { type: SchemaType.STRING, enum: [...MARKET_VALUES] },
      trendLevel:         { type: SchemaType.NUMBER },
      businessTypes:      { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      hasScript:          { type: SchemaType.BOOLEAN },
      estimatedBudget:    { type: SchemaType.STRING, enum: [...BUDGET_VALUES] },
    },
    required: [
      'headline_sv', 'description_sv', 'whyItWorks_sv', 'script_sv',
      'productionNotes_sv', 'whyItFits_sv', 'difficulty', 'filmTime',
      'peopleNeeded', 'mechanism', 'market', 'trendLevel',
      'businessTypes', 'hasScript', 'estimatedBudget',
    ],
  } as unknown as FunctionDeclaration['parameters'],
}

const ENRICH_TOOL: Tool = { functionDeclarations: [enrichFunctionDeclaration] }

// ── Fallback from raw analysis ─────────────────────────────────────────────

function clampEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T[number]
  }
  return fallback
}

function dedupeStringArray(value: unknown, maxLen: number): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const t = item.trim()
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    result.push(t)
    if (result.length >= maxLen) break
  }
  return result
}

function clampEnumArray<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  maxLen: number,
): Array<T[number]> {
  if (!Array.isArray(value)) return []
  const result: Array<T[number]> = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const t = item.trim()
    if (!t || seen.has(t) || !(allowed as readonly string[]).includes(t)) continue
    seen.add(t)
    result.push(t as T[number])
    if (result.length >= maxLen) break
  }
  return result
}

function buildFallback(data: Record<string, unknown>): EnrichedConcept {
  // Navigate into the analysis structure safely
  const getObj = (obj: unknown, key: string): Record<string, unknown> => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const v = (obj as Record<string, unknown>)[key]
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return v as Record<string, unknown>
      }
    }
    return {}
  }

  const script = getObj(data, 'script')
  const content = getObj(data, 'content')
  const audio = getObj(data, 'audio')
  const technical = getObj(data, 'technical')
  const replicability = getObj(script, 'replicability')

  const conceptCore = typeof script['conceptCore'] === 'string' ? script['conceptCore'] : ''
  const keyMessage = typeof content['keyMessage'] === 'string' ? content['keyMessage'] : ''
  const transcript = typeof script['transcript'] === 'string' ? script['transcript'] : ''
  const hasVoiceover = audio['hasVoiceover'] === true

  const resourceReq = typeof replicability['resourceRequirements'] === 'string'
    ? replicability['resourceRequirements']
    : 'medium'
  const difficultyMap: Record<string, DifficultyValue> = {
    low: 'easy', medium: 'medium', high: 'advanced',
  }
  const difficulty = difficultyMap[resourceReq] ?? 'medium'

  const pacing = typeof technical['pacing'] === 'number' ? technical['pacing'] : 5
  const filmTime: FilmTimeValue = pacing >= 8 ? '5min' : pacing >= 5 ? '10min' : '15min'

  const humorObj = getObj(script, 'humor')
  const humorType = typeof humorObj['humorType'] === 'string' ? humorObj['humorType'] : 'none'
  const isHumorous = humorObj['isHumorous'] === true
  const mechMap: Record<string, MechanismValue> = {
    subversion: 'subversion', contrast: 'contrast', recognition: 'recognition',
    dark: 'dark', escalation: 'escalation', deadpan: 'deadpan', absurdism: 'absurdism',
  }
  const mechanism = mechMap[humorType] ?? (isHumorous ? 'contrast' : 'recognition')

  const actors = getObj(getObj(data, 'schema_v1_signals'), 'replicability')['actor_count']
  const actorMap: Record<string, PeopleValue> = {
    solo: 'solo', duo: 'duo', small_team: 'small_team', large_team: 'team',
  }
  const peopleNeeded: PeopleValue =
    (typeof actors === 'string' && actorMap[actors]) ? actorMap[actors] : 'solo'

  return {
    headline_sv: (conceptCore || keyMessage).slice(0, 60) || 'Nytt videokoncept',
    description_sv: keyMessage.slice(0, 400),
    whyItWorks_sv: '',
    script_sv: transcript.slice(0, 4000),
    productionNotes_sv: dedupeStringArray(replicability['requiredElements'], 5),
    whyItFits_sv: [],
    difficulty,
    filmTime,
    peopleNeeded,
    mechanism,
    market: 'SE',
    trendLevel: 3,
    businessTypes: ['restaurang'],
    hasScript: typeof script['hasScript'] === 'boolean' ? script['hasScript'] : hasVoiceover,
    estimatedBudget: 'low',
  }
}

function mergeToolCall(
  args: Record<string, unknown>,
  fallback: EnrichedConcept,
): EnrichedConcept {
  const str = (key: string, maxLen: number, fb: string): string => {
    const v = args[key]
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, maxLen) : fb
  }

  const productionNotes = dedupeStringArray(args['productionNotes_sv'], 5)
  const whyItFits = dedupeStringArray(args['whyItFits_sv'], 4)
  const businessTypes = clampEnumArray(args['businessTypes'], BUSINESS_TYPE_VALUES, 3)

  return {
    headline_sv: str('headline_sv', 120, fallback.headline_sv),
    description_sv: str('description_sv', 400, fallback.description_sv),
    whyItWorks_sv: str('whyItWorks_sv', 500, fallback.whyItWorks_sv),
    script_sv: str('script_sv', 4000, fallback.script_sv),
    productionNotes_sv: productionNotes.length ? productionNotes : fallback.productionNotes_sv,
    whyItFits_sv: whyItFits.length ? whyItFits : fallback.whyItFits_sv,
    difficulty: clampEnum(args['difficulty'], DIFFICULTY_VALUES, fallback.difficulty),
    filmTime: clampEnum(args['filmTime'], FILM_TIME_VALUES, fallback.filmTime),
    peopleNeeded: clampEnum(args['peopleNeeded'], PEOPLE_VALUES, fallback.peopleNeeded),
    mechanism: clampEnum(args['mechanism'], MECHANISM_VALUES, fallback.mechanism),
    market: clampEnum(args['market'], MARKET_VALUES, 'SE'),
    trendLevel: typeof args['trendLevel'] === 'number'
      ? Math.max(1, Math.min(5, Math.round(args['trendLevel'] as number)))
      : fallback.trendLevel,
    businessTypes: businessTypes.length ? businessTypes : fallback.businessTypes,
    hasScript: typeof args['hasScript'] === 'boolean' ? args['hasScript'] as boolean : fallback.hasScript,
    estimatedBudget: clampEnum(args['estimatedBudget'], BUDGET_VALUES, fallback.estimatedBudget),
  }
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const backendData = rawBody['backend_data']
    if (!backendData || typeof backendData !== 'object' || Array.isArray(backendData)) {
      return NextResponse.json(
        { error: 'validation_error', message: 'backend_data is required and must be an object' },
        { status: 400 },
      )
    }

    const data = backendData as Record<string, unknown>
    const fallback = buildFallback(data)

    if (!process.env.GEMINI_API_KEY) {
      console.warn('[studio/enrich] GEMINI_API_KEY not set — returning heuristic fallback')
      return NextResponse.json({ overrides: fallback })
    }

    // ── Build user prompt ────────────────────────────────────────────────────
    const getStr = (obj: unknown, key: string): string => {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const v = (obj as Record<string, unknown>)[key]
        return typeof v === 'string' ? v : ''
      }
      return ''
    }
    const getObj = (obj: unknown, key: string): Record<string, unknown> => {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const v = (obj as Record<string, unknown>)[key]
        return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
      }
      return {}
    }

    const script = getObj(data, 'script')
    const content = getObj(data, 'content')
    const audio = getObj(data, 'audio')
    const visual = getObj(data, 'visual')
    const technical = getObj(data, 'technical')
    const replicability = getObj(script, 'replicability')
    const humor = getObj(script, 'humor')

    const reqElements = Array.isArray(replicability['requiredElements'])
      ? (replicability['requiredElements'] as unknown[])
          .filter((x): x is string => typeof x === 'string')
          .join(', ')
      : ''

    const textOverlays = Array.isArray(visual['textOverlays'])
      ? (visual['textOverlays'] as unknown[])
          .filter((x): x is string => typeof x === 'string')
          .join(', ')
      : '(inga)'

    const humorInfo = humor['isHumorous'] === true
      ? `Ja – ${getStr(humor, 'humorType')}, ${getStr(humor, 'humorMechanism')}`
      : 'Nej'

    const structureObj = getObj(script, 'structure')

    const userPrompt = [
      'Analysdata:',
      '',
      `Konceptkärna: ${getStr(script, 'conceptCore') || getStr(content, 'keyMessage') || '(saknas)'}`,
      `Nyckelbudskap: ${getStr(content, 'keyMessage')}`,
      `Format: ${getStr(content, 'format')}`,
      `Målgrupp: ${getStr(content, 'targetAudience')}`,
      `Humor: ${humorInfo}`,
      `Transkript: ${getStr(script, 'transcript').slice(0, 600) || '(saknas)'}`,
      `Replikbarhet: ${getStr(replicability, 'template')} (score ${replicability['score'] ?? '?'}/10)`,
      `Nödvändiga element: ${reqElements}`,
      `Röst/voiceover: ${audio['hasVoiceover'] === true ? 'Ja' : 'Nej'}`,
      `Textoverlay på skärm: ${textOverlays}`,
      `Tempo/pacing: ${technical['pacing'] ?? ''}/10`,
      `Hook: ${getStr(structureObj, 'hook')}`,
      `Setup: ${getStr(structureObj, 'setup')}`,
      `Payoff: ${getStr(structureObj, 'payoff')}`,
    ].join('\n')

    // ── Call Gemini with function calling ────────────────────────────────────
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-001',
      systemInstruction: ENRICH_CONCEPT_SYSTEM_PROMPT,
      tools: [ENRICH_TOOL],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    })

    const result = await model.generateContent(userPrompt)
    const calls = result.response.functionCalls()
    const call = calls?.find((c) => c.name === 'enrich_concept')

    let overrides: EnrichedConcept
    if (call?.args) {
      overrides = mergeToolCall(call.args as Record<string, unknown>, fallback)
    } else {
      console.warn('[studio/enrich] No function call returned — using heuristic fallback')
      overrides = fallback
    }

    return NextResponse.json({ overrides })
  } catch (err) {
    console.error('[studio/enrich] Error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'enrich_failed', message }, { status: 500 })
  }
}
