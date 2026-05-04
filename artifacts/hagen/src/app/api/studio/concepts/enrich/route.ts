/**
 * POST /api/studio/concepts/enrich
 *
 * Studio ingest step 2 — given the raw backend analysis object produced by
 * the /analyze step, call Gemini to generate Swedish-language concept
 * metadata for LeTrend's concept library.
 *
 * Request body: { backend_data: Record<string, unknown> }
 *
 * Response shape:
 *   { overrides: EnrichedConceptOverride }
 *
 * The overrides object is validated against the enrichedConceptSchema
 * defined in letrend/src/lib/concept-enrichment.ts.  Any field that
 * Gemini fails to populate correctly falls back to a heuristic derived
 * from the raw analysis.
 */

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const maxDuration = 45

// ── Enumerations (mirror of letrend/src/lib/concept-enrichment.ts) ─────────

const DIFFICULTY_VALUES = ['easy', 'medium', 'advanced'] as const
const FILM_TIME_VALUES = ['5min', '10min', '15min', '20min', '30min', '1hr', '1hr_plus'] as const
const PEOPLE_VALUES = ['solo', 'duo', 'small_team', 'team'] as const
const MECHANISM_VALUES = [
  'subversion', 'contrast', 'recognition', 'dark', 'escalation', 'deadpan', 'absurdism',
] as const
const MARKET_VALUES = ['SE', 'US', 'UK'] as const
const BUDGET_VALUES = ['free', 'low', 'medium', 'high'] as const
const BUSINESS_TYPE_VALUES = [
  'bar', 'restaurang', 'cafe', 'bistro', 'hotell', 'foodtruck', 'nattklubb', 'bageri',
] as const

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Du är en innehållsstrateg för svenska restauranger, barer, caféer och hotell.

Du får analysdata för ett videokoncept och ska returnera strukturerad JSON för LeTrends konceptbibliotek.

SCRIPT-NOTATION:
- Om konceptet har tal/dialog, inled varje replik med [Dialog]:
- Om konceptet har textkort eller textoverlay, inled med [Textoverlay]:
- Om konceptet är rent visuellt utan tal, inled med [Visuell]:
- Kombinera typer när de förekommer i samma video.

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
- hasScript ska vara true om konceptet har ett tydligt manus eller tydliga repliker att följa.

Returnera ENBART giltig JSON utan markdown-kodblock.`

// ── Response schema (used to validate Gemini output) ───────────────────────

function clamp<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return (allowed as readonly string[]).includes(value as string)
    ? (value as T[number])
    : fallback
}

function clampArr<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  max: number,
): Array<T[number]> {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: Array<T[number]> = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue
    if ((allowed as readonly string[]).includes(trimmed)) {
      seen.add(trimmed)
      result.push(trimmed as T[number])
      if (result.length >= max) break
    }
  }
  return result
}

function dedupeStrings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const t = item.trim()
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    result.push(t)
    if (result.length >= max) break
  }
  return result
}

function extractStr(obj: Record<string, unknown>, key: string, fallback = ''): string {
  const v = obj[key]
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

/** Derive reasonable fallbacks from the raw backend_data analysis. */
function buildFallback(data: Record<string, unknown>): Record<string, unknown> {
  const analysis = (data as any)
  const script = analysis?.script || {}
  const content = analysis?.content || {}
  const replicability = script?.replicability || {}
  const technical = analysis?.technical || {}
  const schemaV1 = analysis?.schema_v1_signals || {}

  const hasVoiceover = !!analysis?.audio?.hasVoiceover
  const isHumorous = !!script?.humor?.isHumorous
  const hasScript = script?.hasScript ?? (hasVoiceover || !!script?.transcript)

  const actors = schemaV1?.replicability?.actor_count || 'solo'
  const actorMap: Record<string, string> = {
    solo: 'solo', duo: 'duo', small_team: 'small_team', large_team: 'team',
  }
  const peopleNeeded = actorMap[actors] || 'solo'

  const resourceReq = replicability?.resourceRequirements || 'medium'
  const difficultyMap: Record<string, string> = { low: 'easy', medium: 'medium', high: 'advanced' }
  const difficulty = difficultyMap[resourceReq] || 'medium'

  const pacing = typeof technical?.pacing === 'number' ? technical.pacing : 5
  const filmTime = pacing >= 8 ? '5min' : pacing >= 5 ? '10min' : '15min'

  const humorMech = script?.humor?.humorType || 'none'
  const mechMap: Record<string, string> = {
    subversion: 'subversion', contrast: 'contrast', recognition: 'recognition',
    dark: 'dark', escalation: 'escalation', deadpan: 'deadpan', absurdism: 'absurdism',
  }
  const mechanism = mechMap[humorMech] || (isHumorous ? 'contrast' : 'recognition')

  const concept = script?.conceptCore || content?.keyMessage || ''
  const headline = concept.slice(0, 60) || 'Nytt videokoncept'

  return {
    headline_sv: headline,
    description_sv: content?.keyMessage || concept || '',
    whyItWorks_sv: script?.humor?.humorMechanism || '',
    script_sv: script?.transcript || '',
    productionNotes_sv: replicability?.requiredElements?.slice(0, 5) || [],
    whyItFits_sv: [],
    difficulty,
    filmTime,
    peopleNeeded,
    mechanism,
    market: 'SE',
    trendLevel: 3,
    businessTypes: ['restaurang'],
    hasScript,
    estimatedBudget: 'low',
  }
}

/** Merge Gemini output on top of fallback, clamp all enum fields. */
function mergeAndClamp(
  gemini: Record<string, unknown>,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  const g = gemini
  const f = fallback

  const headline = extractStr(g, 'headline_sv') || extractStr(f as any, 'headline_sv', 'Nytt videokoncept')
  const productionNotes = dedupeStrings(g['productionNotes_sv'], 5).length
    ? dedupeStrings(g['productionNotes_sv'], 5)
    : dedupeStrings(f['productionNotes_sv'], 5)
  const whyItFits = dedupeStrings(g['whyItFits_sv'], 4).length
    ? dedupeStrings(g['whyItFits_sv'], 4)
    : dedupeStrings(f['whyItFits_sv'], 4)
  const businessTypes = clampArr(g['businessTypes'], BUSINESS_TYPE_VALUES, 3).length
    ? clampArr(g['businessTypes'], BUSINESS_TYPE_VALUES, 3)
    : clampArr(f['businessTypes'], BUSINESS_TYPE_VALUES, 3)

  return {
    headline_sv: headline.slice(0, 120),
    description_sv: (extractStr(g, 'description_sv') || extractStr(f as any, 'description_sv')).slice(0, 400),
    whyItWorks_sv: (extractStr(g, 'whyItWorks_sv') || extractStr(f as any, 'whyItWorks_sv')).slice(0, 500),
    script_sv: (extractStr(g, 'script_sv') || extractStr(f as any, 'script_sv')).slice(0, 4000),
    productionNotes_sv: productionNotes,
    whyItFits_sv: whyItFits,
    difficulty: clamp(g['difficulty'], DIFFICULTY_VALUES, f['difficulty'] as 'medium'),
    filmTime: clamp(g['filmTime'], FILM_TIME_VALUES, f['filmTime'] as '10min'),
    peopleNeeded: clamp(g['peopleNeeded'], PEOPLE_VALUES, f['peopleNeeded'] as 'solo'),
    mechanism: clamp(g['mechanism'], MECHANISM_VALUES, f['mechanism'] as 'recognition'),
    market: clamp(g['market'], MARKET_VALUES, 'SE'),
    trendLevel: typeof g['trendLevel'] === 'number'
      ? Math.max(1, Math.min(5, Math.round(g['trendLevel'])))
      : (f['trendLevel'] as number ?? 3),
    businessTypes: businessTypes.length ? businessTypes : ['restaurang'],
    hasScript: typeof g['hasScript'] === 'boolean' ? g['hasScript'] : (f['hasScript'] as boolean ?? false),
    estimatedBudget: clamp(g['estimatedBudget'], BUDGET_VALUES, f['estimatedBudget'] as 'low'),
  }
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => ({})) as Record<string, unknown>
    const backendData = rawBody['backend_data']
    if (!backendData || typeof backendData !== 'object') {
      return NextResponse.json(
        { error: 'validation-error', message: 'backend_data is required' },
        { status: 400 },
      )
    }

    const data = backendData as Record<string, unknown>
    const fallback = buildFallback(data)

    if (!process.env.GEMINI_API_KEY) {
      // Gracefully return heuristic overrides when Gemini is unavailable.
      console.warn('[studio/enrich] GEMINI_API_KEY not set — returning heuristic fallback')
      return NextResponse.json({ overrides: fallback })
    }

    // ── Build the user prompt ───────────────────────────────────────────────
    const script = (data as any)?.script || {}
    const content = (data as any)?.content || {}
    const audio = (data as any)?.audio || {}
    const visual = (data as any)?.visual || {}
    const technical = (data as any)?.technical || {}
    const replicability = script?.replicability || {}

    const userPrompt = [
      'Analysdata:',
      '',
      `Konceptkärna: ${script?.conceptCore || content?.keyMessage || '(saknas)'}`,
      `Nyckelbudskap: ${content?.keyMessage || ''}`,
      `Format: ${content?.format || ''}`,
      `Målgrupp: ${content?.targetAudience || ''}`,
      `Humor: ${script?.humor?.isHumorous ? `Ja – ${script.humor.humorType || ''}, ${script.humor.humorMechanism || ''}` : 'Nej'}`,
      `Transkript: ${script?.transcript ? script.transcript.slice(0, 600) : '(saknas)'}`,
      `Replikbarhet: ${replicability?.template || ''} (score ${replicability?.score ?? '?'}/10)`,
      `Nödvändiga element: ${Array.isArray(replicability?.requiredElements) ? replicability.requiredElements.join(', ') : ''}`,
      `Röst/voiceover: ${audio?.hasVoiceover ? 'Ja' : 'Nej'}`,
      `Textoverlay på skärm: ${Array.isArray(visual?.textOverlays) && visual.textOverlays.length ? visual.textOverlays.join(', ') : '(inga)'}`,
      `Tempo/pacing: ${technical?.pacing ?? ''}/10`,
      `Hook: ${script?.structure?.hook || ''}`,
      `Setup: ${script?.structure?.setup || ''}`,
      `Payoff: ${script?.structure?.payoff || ''}`,
      '',
      'Returnera JSON med dessa fält:',
      '{ "headline_sv", "description_sv", "whyItWorks_sv", "script_sv",',
      '  "productionNotes_sv", "whyItFits_sv", "difficulty", "filmTime",',
      '  "peopleNeeded", "mechanism", "market", "trendLevel",',
      '  "businessTypes", "hasScript", "estimatedBudget" }',
    ].join('\n')

    // ── Call Gemini ─────────────────────────────────────────────────────────
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-001',
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    })

    const result = await model.generateContent(userPrompt)
    const rawText = result.response.text().trim()

    let geminiOutput: Record<string, unknown> = {}
    try {
      // Strip accidental markdown fences
      const stripped = rawText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()
      const firstBrace = stripped.indexOf('{')
      const lastBrace = stripped.lastIndexOf('}')
      const jsonStr =
        firstBrace !== -1 && lastBrace > firstBrace
          ? stripped.slice(firstBrace, lastBrace + 1)
          : stripped
      geminiOutput = JSON.parse(jsonStr) as Record<string, unknown>
    } catch (parseErr) {
      console.warn('[studio/enrich] Gemini JSON parse failed, using fallback:', parseErr)
    }

    const overrides = mergeAndClamp(geminiOutput, fallback)
    return NextResponse.json({ overrides })
  } catch (err) {
    console.error('[studio/enrich] Error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: 'enrich-failed', message },
      { status: 500 },
    )
  }
}
