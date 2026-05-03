import { Router, type Request, type Response } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const CM_ONLY = requireRole(['admin', 'content_manager']);

// Field length constraints — keep in sync with
// artifacts/letrend/src/lib/concept-field-constraints.ts
const FIELD_CONSTRAINTS = {
  headline_sv: { min: 20, max: 70, target: '30–55', hint: 'En kort svensk hook-rad. Namnge greppet, inte plattformen eller kreatören.' },
  description_sv: { min: 70, max: 160, target: '90–130', hint: '1–2 meningar som beskriver vad konceptet är, ur kundens perspektiv.' },
  whyItWorks_sv: { min: 90, max: 260, target: '150–210', hint: 'Varför formatet fungerar mekaniskt. Hooken, twisten, payoffen.' },
  script_sv: { min: 0, max: 700, target: '250–500', hint: 'Eventuellt manus. Tomt OK om formatet inte har talad text.' },
} as const;

type Field = keyof typeof FIELD_CONSTRAINTS;

const ALLOWED_MODELS = ['gemini', 'hagen-finetuned'] as const;
type Model = (typeof ALLOWED_MODELS)[number];

function buildPrompt(field: Field, conceptContext: Record<string, unknown>): string {
  const c = FIELD_CONSTRAINTS[field];
  const tone = [
    'Direkt svenska, inga emojis i headline/description/whyItWorks.',
    'Undvik marknadsfluff. Skriv konkret och observerbart.',
    'Headline namnger konceptet/greppet, inte plattformen eller kreatören.',
    'Beskriv mekaniken (hook, subversion, payoff) — inte bara "det är roligt".',
  ].join('\n- ');

  return [
    `Du är en svensk content manager som skriver fältet "${field}" för ett TikTok-koncept.`,
    `Längd: ${c.target} tecken (max ${c.max}, min ${c.min}).`,
    `Krav: ${c.hint}`,
    `Tonregler:\n- ${tone}`,
    'Returnera bara texten — inga citationstecken, ingen rubrik, inga JSON-objekt.',
    '',
    `Konceptkontext (JSON, för referens):`,
    JSON.stringify(conceptContext, null, 2).slice(0, 4000),
  ].join('\n');
}

async function callModel(model: Model, prompt: string): Promise<string> {
  if (model === 'hagen-finetuned') {
    const hagenBase = process.env['HAGEN_BASE_URL']?.trim();
    if (!hagenBase) throw new Error('HAGEN_BASE_URL ej satt — kan inte använda hagen-finetuned.');
    const upstream = await fetch(`${hagenBase}/api/studio/concepts/regenerate-field`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(20000),
    });
    if (!upstream.ok) throw new Error(`hagen returned ${upstream.status}`);
    const data = await upstream.json() as { text?: string };
    return (data.text || '').trim();
  }

  // gemini via Replit AI Integrations proxy
  const apiKey = process.env['REPLIT_AI_INTEGRATIONS_API_KEY']
    ?? process.env['GEMINI_API_KEY'];
  const baseUrl = process.env['REPLIT_AI_INTEGRATIONS_GEMINI_BASE_URL']
    ?? 'https://generativelanguage.googleapis.com/v1beta';
  if (!apiKey) throw new Error('Saknar API-nyckel för Gemini.');

  const upstream = await fetch(`${baseUrl}/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!upstream.ok) {
    const txt = await upstream.text().catch(() => '');
    throw new Error(`Gemini returnerade ${upstream.status}: ${txt.slice(0, 200)}`);
  }
  const data = await upstream.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

function validate(field: Field, output: string): string | null {
  const c = FIELD_CONSTRAINTS[field];
  const len = output.trim().length;
  if (len < c.min) return `För kort: ${len} tecken (min ${c.min}).`;
  if (len > c.max) return `För långt: ${len} tecken (max ${c.max}).`;
  return null;
}

// POST /api/admin/concepts/:id/regenerate-field
// Body: { field: 'headline_sv' | ..., model: 'gemini' | 'hagen-finetuned' }
router.post('/:id/regenerate-field', requireAuth, CM_ONLY, async (req: Request, res: Response) => {
  try {
    const supabase = createSupabaseAdmin();
    const conceptId = req.params['id'] as string;
    const { field, model } = req.body as { field?: string; model?: string };

    if (!field || !(field in FIELD_CONSTRAINTS)) {
      res.status(400).json({ error: `Ogiltigt fält: ${field}` });
      return;
    }
    if (!model || !ALLOWED_MODELS.includes(model as Model)) {
      res.status(400).json({ error: `Ogiltig modell: ${model}` });
      return;
    }

    const { data: concept, error: loadErr } = await supabase
      .from('concepts')
      .select('id, backend_data, overrides')
      .eq('id', conceptId)
      .single();
    if (loadErr || !concept) {
      res.status(404).json({ error: 'Konceptet hittades inte' });
      return;
    }

    const ctx = {
      backend_data: concept.backend_data,
      overrides: concept.overrides,
    };
    const prompt = buildPrompt(field as Field, ctx);

    let output = '';
    let err: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        output = await callModel(model as Model, attempt === 0 ? prompt : `${prompt}\n\nFörsök igen: håll texten inom intervallet.`);
        err = validate(field as Field, output);
        if (!err) break;
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
        break;
      }
    }

    const { data: row, error: insertErr } = await supabase
      .from('concept_field_regenerations')
      .insert({
        concept_id: conceptId,
        field,
        model,
        output: output || '(tomt svar)',
        created_by: req.user?.id ?? null,
      })
      .select()
      .single();
    if (insertErr) logger.warn({ err: insertErr }, 'failed to log regeneration');

    if (err) {
      res.status(422).json({ error: err, output, regeneration_id: row?.id });
      return;
    }
    res.json({ output, regeneration_id: row?.id, model, field });
  } catch (e) {
    logger.error(e, 'concept regenerate-field error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/concepts/:id/regenerations?field=headline_sv
router.get('/:id/regenerations', requireAuth, CM_ONLY, async (req: Request, res: Response) => {
  try {
    const supabase = createSupabaseAdmin();
    const conceptId = req.params['id'] as string;
    const field = req.query['field'] as string | undefined;
    let q = supabase
      .from('concept_field_regenerations')
      .select('id, field, model, output, output_chars, was_picked, created_at')
      .eq('concept_id', conceptId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (field) q = q.eq('field', field);
    const { data, error } = await q;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ regenerations: data ?? [] });
  } catch (e) {
    logger.error(e, 'concept regenerations GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/concepts/:id/regenerations/:regenId/pick
router.post('/:id/regenerations/:regenId/pick', requireAuth, CM_ONLY, async (req: Request, res: Response) => {
  try {
    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('concept_field_regenerations')
      .update({ was_picked: true })
      .eq('id', req.params['regenId'])
      .eq('concept_id', req.params['id']);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    logger.error(e, 'concept regenerations pick error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
