import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createSupabaseAdmin, createSupabaseUserClient } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const router = Router();

async function resolveCustomerProfileId(userId: string): Promise<string | null> {
  const supabase = createSupabaseAdmin();
  const { data: profile } = await supabase
    .from('profiles')
    .select('matching_data')
    .eq('id', userId)
    .single();
  if (!profile) return null;
  const md = profile.matching_data as Record<string, unknown> | null;
  return (md?.customer_profile_id as string) ?? null;
}

// GET /api/customer/feed
router.get('/feed', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const supabase = createSupabaseAdmin();
    const customerProfileId = await resolveCustomerProfileId(userId);
    if (!customerProfileId) {
      res.json({ slots: [], generatedAt: new Date().toISOString() });
      return;
    }

    const { data: rows, error } = await supabase
      .from('customer_concepts')
      .select(`
        id, concept_id, content_overrides, match_percentage, status,
        feed_order, sent_at, produced_at, published_at, tiktok_url,
        tiktok_thumbnail_url, tiktok_views, tiktok_likes, cm_note,
        concepts ( id, backend_data, overrides, is_active )
      `)
      .eq('customer_profile_id', customerProfileId)
      .neq('status', 'archived')
      .not('feed_order', 'is', null)
      .order('feed_order', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const slots = (rows ?? []).map((row: Record<string, unknown>) => {
      const feedOrder = row.feed_order as number;
      const bucket =
        feedOrder === 0 ? 'current' : feedOrder > 0 ? 'upcoming' : 'history';
      const conceptArr = Array.isArray(row.concepts) ? row.concepts : row.concepts ? [row.concepts] : [];
      const concept = conceptArr[0] as Record<string, unknown> | null ?? null;
      const backendData = (concept?.backend_data ?? {}) as Record<string, unknown>;
      const overrides = (row.content_overrides ?? {}) as Record<string, unknown>;
      const title = (overrides.title ?? backendData.title ?? backendData.topic ?? '') as string;

      return {
        id: row.id,
        placement: { bucket, feedOrder },
        title: title || (bucket === 'current' ? 'Aktuellt koncept' : bucket === 'upcoming' ? 'Kommande koncept' : 'Tidigare koncept'),
        status: row.status,
        sentAt: row.sent_at,
        producedAt: row.produced_at,
        publishedAt: row.published_at,
        tiktokUrl: row.tiktok_url,
        tiktokThumbnailUrl: row.tiktok_thumbnail_url,
        tiktokViews: row.tiktok_views,
        tiktokLikes: row.tiktok_likes,
        cmNote: row.cm_note,
        matchPercentage: row.match_percentage,
        conceptId: row.concept_id,
        isActive: concept?.is_active ?? false,
      };
    });

    res.json({ slots, generatedAt: new Date().toISOString() });
  } catch (err) {
    logger.error(err, 'customer feed error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/customer/game-plan
router.get('/game-plan', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const supabase = createSupabaseAdmin();
    const customerProfileId = await resolveCustomerProfileId(userId);
    if (!customerProfileId) {
      res.json({ business_name: null, brief: null, game_plan_html: '', has_game_plan: false });
      return;
    }

    const { data: customerProfile, error } = await supabase
      .from('customer_profiles')
      .select('business_name, brief, game_plan, account_manager')
      .eq('id', customerProfileId)
      .single();

    if (error || !customerProfile) {
      res.status(404).json({ error: 'Kundprofil hittades inte' });
      return;
    }

    const { data: gamePlanRecord } = await supabase
      .from('customer_game_plans')
      .select('html, plain_text, editor_version, updated_at')
      .eq('customer_id', customerProfileId)
      .maybeSingle();

    const gameplanHtml = gamePlanRecord?.html ??
      (typeof (customerProfile as Record<string, unknown>).game_plan === 'string'
        ? (customerProfile as Record<string, unknown>).game_plan as string
        : '') ?? '';

    res.json({
      business_name: (customerProfile as Record<string, unknown>).business_name ?? null,
      brief: (customerProfile as Record<string, unknown>).brief ?? null,
      cm_name: ((customerProfile as Record<string, unknown>).account_manager as string | null)?.trim() || null,
      game_plan_html: gameplanHtml,
      has_game_plan: Boolean(gameplanHtml),
      game_plan: {
        html: gameplanHtml,
        plain_text: gamePlanRecord?.plain_text ?? null,
        editor_version: gamePlanRecord?.editor_version ?? null,
        updated_at: gamePlanRecord?.updated_at ?? null,
      },
    });
  } catch (err) {
    logger.error(err, 'customer game-plan error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/customer/notes
router.get('/notes', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const supabase = createSupabaseAdmin();
    const customerProfileId = await resolveCustomerProfileId(userId);
    if (!customerProfileId) {
      res.json({ notes: [] });
      return;
    }
    const limit = Math.min(Number(req.query['limit'] ?? 5), 20);
    const { data, error } = await supabase
      .from('customer_notes')
      .select('id, customer_id, cm_id, content, content_html, note_type, primary_customer_concept_id, references, attachments, created_at, updated_at')
      .eq('customer_id', customerProfileId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ notes: data ?? [] });
  } catch (err) {
    logger.error(err, 'customer notes error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/customer/notes
router.post('/notes', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const supabase = createSupabaseAdmin();
    const customerProfileId = await resolveCustomerProfileId(userId);
    if (!customerProfileId) {
      res.status(404).json({ error: 'Kundprofil hittades inte' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const contentHtml = typeof body.content_html === 'string' ? body.content_html : null;
    if (!content && !contentHtml) {
      res.status(400).json({ error: 'Note content is required' });
      return;
    }
    const { data, error } = await supabase
      .from('customer_notes')
      .insert({
        customer_id: customerProfileId,
        cm_id: userId,
        content,
        content_html: contentHtml,
        note_type: typeof body.note_type === 'string' ? body.note_type : 'general',
        primary_customer_concept_id: typeof body.primary_customer_concept_id === 'string' ? body.primary_customer_concept_id : null,
        references: Array.isArray(body.references) ? body.references : [],
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(201).json({ note: data });
  } catch (err) {
    logger.error(err, 'customer notes POST error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/customer/concepts
router.get('/concepts', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const supabase = createSupabaseAdmin();
    const customerProfileId = await resolveCustomerProfileId(userId);
    if (!customerProfileId) {
      res.json({ concepts: [] });
      return;
    }
    const { data, error } = await supabase
      .from('customer_concepts')
      .select('id, concept_id, status, feed_order, sent_at, produced_at, published_at, tiktok_url, match_percentage, cm_note, content_overrides, concepts(id, backend_data, overrides, is_active)')
      .eq('customer_profile_id', customerProfileId)
      .neq('status', 'archived')
      .order('feed_order', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ concepts: data ?? [] });
  } catch (err) {
    logger.error(err, 'customer concepts error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/customer/concepts/:conceptId
router.get('/concepts/:conceptId', requireAuth, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const userId = req.user!.id;
    const customerProfileId = await resolveCustomerProfileId(userId);
    if (!customerProfileId) {
      res.status(404).json({ error: 'Kundprofil hittades inte' });
      return;
    }
    const { data, error } = await supabase
      .from('customer_concepts')
      .select('id, concept_id, status, feed_order, sent_at, produced_at, published_at, tiktok_url, match_percentage, cm_note, content_overrides, concepts(id, backend_data, overrides, is_active)')
      .eq('id', req.params['conceptId'])
      .eq('customer_profile_id', customerProfileId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: 'Konceptet hittades inte' });
      return;
    }
    res.json({ concept: data });
  } catch (err) {
    logger.error(err, 'customer concept by id error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PATCH /api/customer/concepts/:conceptId
router.patch('/concepts/:conceptId', requireAuth, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const userId = req.user!.id;
    const customerProfileId = await resolveCustomerProfileId(userId);
    if (!customerProfileId) {
      res.status(404).json({ error: 'Kundprofil hittades inte' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof body.content_overrides === 'object' && body.content_overrides !== null) {
      patch.content_overrides = body.content_overrides;
    }
    const { data, error } = await supabase
      .from('customer_concepts')
      .update(patch)
      .eq('id', req.params['conceptId'])
      .eq('customer_profile_id', customerProfileId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ concept: data });
  } catch (err) {
    logger.error(err, 'customer concept PATCH error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
