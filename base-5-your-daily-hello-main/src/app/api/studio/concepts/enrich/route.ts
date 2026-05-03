import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/api-auth'
import {
  buildFallbackEnrichedConcept,
  ENRICH_CONCEPT_SYSTEM_PROMPT,
  ENRICH_CONCEPT_TOOL,
  normalizeEnrichedConcept,
} from '@/lib/concept-enrichment'
import type { BackendClip } from '@/lib/translator'

const requestSchema = z.object({
  backend_data: z.record(z.string(), z.unknown()),
})

async function readGatewayResponse(response: Response) {
  const payload = await response.json().catch(() => ({}))
  const toolCall = payload?.choices?.[0]?.message?.tool_calls?.[0]
  const toolArgs = toolCall?.function?.arguments

  if (typeof toolArgs === 'string' && toolArgs.trim()) {
    return JSON.parse(toolArgs)
  }

  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string' && content.trim()) {
    return JSON.parse(content)
  }

  throw new Error('No structured response from enrichment model')
}

export const POST = withAuth(
  async (request: NextRequest) => {
    const parsedBody = requestSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'backend_data is required' }, { status: 400 })
    }

    const backendData = parsedBody.data.backend_data as unknown as BackendClip
    const fallback = buildFallbackEnrichedConcept(backendData)
    const apiKey = process.env.LOVABLE_API_KEY?.trim()
    const model = process.env.LOVABLE_AI_MODEL?.trim() || 'google/gemini-3-flash-preview'

    if (!apiKey) {
      return NextResponse.json({
        overrides: fallback,
        source: 'fallback',
        reason: 'LOVABLE_API_KEY is not configured',
      })
    }

    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: ENRICH_CONCEPT_SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Analysera detta koncept och returnera enbart strukturerad data:\n\n${JSON.stringify(
                backendData,
                null,
                2,
              )}`,
            },
          ],
          tools: [ENRICH_CONCEPT_TOOL],
          tool_choice: { type: 'function', function: { name: 'enrich_concept' } },
        }),
        signal: AbortSignal.timeout(45000),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(errorText || `Gateway error ${response.status}`)
      }

      const raw = await readGatewayResponse(response)
      const overrides = normalizeEnrichedConcept(raw, backendData)

      return NextResponse.json({
        overrides,
        source: 'ai',
      })
    } catch (error) {
      return NextResponse.json({
        overrides: fallback,
        source: 'fallback',
        reason: error instanceof Error ? error.message : 'Unknown enrichment error',
      })
    }
  },
  ['admin', 'content_manager'],
)
