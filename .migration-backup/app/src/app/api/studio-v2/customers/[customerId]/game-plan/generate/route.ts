import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import {
  buildFallbackGeneratedGamePlanHtml,
  buildGamePlanGenerationPrompt,
  normalizeAiGeneratedGamePlanHtml,
  type GamePlanImageInput,
  type GamePlanGenerateInput,
  type GamePlanReferenceInput,
} from '@/lib/game-plan';

const referenceSchema = z.object({
  url: z.string().trim().max(500),
  label: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  platform: z.string().trim().max(40).optional(),
});

const imageSchema = z.object({
  url: z.string().trim().max(500),
  caption: z.string().trim().max(200).optional(),
});

const requestSchema = z.object({
  customer_name: z.string().trim().min(1).max(200),
  niche: z.string().trim().max(400).optional().default(''),
  audience: z.string().trim().max(400).optional().default(''),
  platform: z.string().trim().max(120).optional().default('TikTok'),
  tone: z.string().trim().max(2000).optional().default(''),
  constraints: z.string().trim().max(2000).optional().default(''),
  focus: z.string().trim().max(2000).optional().default(''),
  references: z.array(referenceSchema).max(10).optional().default([]),
  images: z.array(imageSchema).max(10).optional().default([]),
  notes: z.array(z.string().trim().max(500)).max(12).optional().default([]),
  reference_urls: z.array(z.string().trim().max(500)).max(10).optional(),
  image_urls: z.array(z.string().trim().max(500)).max(10).optional(),
});

async function readGatewayHtml(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({}));
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === 'string' && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .flatMap((item) => (typeof item?.text === 'string' ? [item.text] : []))
      .join('\n')
      .trim();

    if (text) return text;
  }

  throw new Error('No HTML returned from model');
}

export const POST = withAuth(async (request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  const model = process.env.LOVABLE_AI_MODEL?.trim() || 'google/gemini-2.5-flash';
  const generatedAt = new Date().toISOString();

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid generate payload' }, { status: 400 });
  }

  const references: GamePlanReferenceInput[] = parsed.data.references.length > 0
    ? parsed.data.references
    : (parsed.data.reference_urls || []).map((url) => ({ url }));
  const images: GamePlanImageInput[] = parsed.data.images.length > 0
    ? parsed.data.images
    : (parsed.data.image_urls || []).map((url) => ({ url }));
  const input: GamePlanGenerateInput = {
    customer_name: parsed.data.customer_name,
    niche: parsed.data.niche,
    audience: parsed.data.audience,
    platform: parsed.data.platform,
    tone: parsed.data.tone,
    constraints: parsed.data.constraints,
    focus: parsed.data.focus,
    references,
    images,
    notes: parsed.data.notes,
  };
  const fallbackHtml = buildFallbackGeneratedGamePlanHtml(input);
  const supabase = createSupabaseAdmin();

  const { data: customer, error: customerError } = await supabase
    .from('customer_profiles')
    .select('id')
    .eq('id', customerId)
    .single();

  if (customerError || !customer) {
    return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
  }

  const apiKey = process.env.LOVABLE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      html: fallbackHtml,
      source: 'fallback',
      model,
      generated_at: generatedAt,
      reason: 'LOVABLE_API_KEY is not configured',
    });
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
          {
            role: 'system',
            content: 'Du skriver svenska strategidokument for LeTrend. Returnera endast HTML-fragment utan markdown eller forklaringar.',
          },
          {
            role: 'user',
            content: buildGamePlanGenerationPrompt(input),
          },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `Gateway error ${response.status}`);
    }

    const rawHtml = await readGatewayHtml(response);
    const html = normalizeAiGeneratedGamePlanHtml(rawHtml);

    if (!html.trim()) {
      throw new Error('Model returned empty HTML');
    }

    return NextResponse.json({
      html,
      source: 'ai',
      model,
      generated_at: generatedAt,
    });
  } catch (error) {
    return NextResponse.json({
      html: fallbackHtml,
      source: 'fallback',
      model,
      generated_at: generatedAt,
      reason: error instanceof Error ? error.message : 'Unknown generation error',
    });
  }
}, ['admin', 'content_manager']);
