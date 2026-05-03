import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ensureCustomerAccess } from '../middleware/cm-access.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { runHistorySyncBatch, syncCustomerHistory, triggerInitialTikTokSyncBackground } from '../lib/studio/tiktok-sync.js';
import { getHagenBase, proxyHagenJson } from '../lib/upstream-proxy.js';

const router = Router();
const CM_ONLY = requireRole(['admin', 'content_manager']);

// Select all customer_concepts columns plus the joined source concept. Using `*`
// keeps the API forward/backward compatible with optional columns (e.g. the
// collaboration-card fields added by 20260503200000_customer_concepts_collaboration_fields.sql)
// that may not yet exist on every environment.
const STUDIO_CONCEPT_SELECT = `
  *,
  concepts ( id, backend_data, overrides, is_active, source, version )
`;

const COLLABORATION_SCOPE_VALUES = new Set([
  'medverka',
  'skriva',
  'producera',
  'skriva_medverka',
]);

function sanitizeScope(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item === 'string' && COLLABORATION_SCOPE_VALUES.has(item)) {
      seen.add(item);
    }
  }
  return Array.from(seen);
}

function sanitizeCollaborationDateType(input: unknown): string | null {
  return input === 'exact' || input === 'projected' ? input : null;
}

function sanitizePrice(input: unknown): number | null {
  if (input === null || input === undefined || input === '') return null;
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Customers
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/studio-v2/customers
router.get('/customers', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const isAdmin = Boolean(req.user?.is_admin || req.user?.role === 'admin');
    let query = supabase
      .from('customer_profiles')
      .select('id, business_name, contact_email, customer_contact_name, account_manager, account_manager_profile_id, monthly_price, status, created_at, game_plan, tiktok_handle, last_history_sync_at')
      .order('created_at', { ascending: false });
    if (!isAdmin && req.user?.id) {
      query = query.eq('account_manager_profile_id', req.user.id);
    }
    const { data: profiles, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const customerIds = (profiles ?? []).map((p) => p.id).filter(Boolean);
    if (customerIds.length === 0) {
      res.json({ customers: [] });
      return;
    }

    const [conceptsResult, emailsResult] = await Promise.all([
      supabase
        .from('customer_concepts')
        .select('customer_profile_id, status')
        .in('customer_profile_id', customerIds)
        .neq('status', 'archived'),
      (supabase as any)
        .from('email_log')
        .select('customer_id, sent_at')
        .in('customer_id', customerIds)
        .order('sent_at', { ascending: false })
        .limit(customerIds.length * 5)
,
    ]);

    const conceptStatsMap = new Map<string, { draft: number; sent: number; produced: number }>();
    for (const c of (conceptsResult.data ?? [])) {
      const cid = c.customer_profile_id as string;
      if (!conceptStatsMap.has(cid)) {
        conceptStatsMap.set(cid, { draft: 0, sent: 0, produced: 0 });
      }
      const stats = conceptStatsMap.get(cid)!;
      const status = c.status as string;
      if (status === 'draft' || status === 'assigned') {
        stats.draft += 1;
      } else if (status === 'sent') {
        stats.sent += 1;
      } else if (status === 'produced') {
        stats.produced += 1;
      }
    }

    const lastEmailMap = new Map<string, string>();
    for (const e of (emailsResult.data ?? [])) {
      const cid = e.customer_id as string;
      if (!lastEmailMap.has(cid)) lastEmailMap.set(cid, e.sent_at as string);
    }

    const customers = (profiles ?? []).map((p) => ({
      ...p,
      concept_stats: conceptStatsMap.get(p.id) ?? { draft: 0, sent: 0, produced: 0 },
      last_email_sent_at: lastEmailMap.get(p.id) ?? null,
    }));

    res.json({ customers });
  } catch (err) {
    logger.error(err, 'studio-v2 customers GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/studio-v2/customers/:customerId/profile
router.get('/customers/:customerId/profile', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('customer_profiles')
      .select('*')
      .eq('id', customerId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Kundprofilen hittades inte.' });
      return;
    }

    const tiktokRuntime = { profile: null, stats: null };
    res.json({ ...data, tiktok_runtime: tiktokRuntime });
  } catch (err) {
    logger.error(err, 'studio-v2 customer profile GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PATCH /api/studio-v2/customers/:customerId/profile
router.patch('/customers/:customerId/profile', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const allowed = [
      'business_name', 'contact_email', 'customer_contact_name', 'account_manager',
      'account_manager_profile_id', 'monthly_price', 'status', 'brief', 'game_plan',
      'tiktok_handle', 'tiktok_profile_url', 'concepts_per_week', 'subscription_interval',
      'contract_start_date', 'billing_day_of_month', 'first_invoice_behavior',
    ];
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    // Detect TikTok handle change so we can trigger a fresh initial backfill.
    const { data: prev } = await supabase
      .from('customer_profiles')
      .select('tiktok_handle')
      .eq('id', customerId)
      .maybeSingle();
    const prevHandleRaw = prev?.tiktok_handle as unknown;
    const prevHandle = typeof prevHandleRaw === 'string' ? prevHandleRaw.trim().replace(/^@/, '') : '';
    const nextHandleRaw = patch['tiktok_handle'];
    const nextHandle = typeof nextHandleRaw === 'string' ? nextHandleRaw.trim().replace(/^@/, '') : '';
    const handleChanged = nextHandleRaw !== undefined && nextHandle !== prevHandle && nextHandle !== '';
    if (handleChanged) {
      patch['last_history_sync_at'] = null;
      patch['last_upload_at'] = null;
    }

    const { data, error } = await supabase
      .from('customer_profiles')
      .update(patch)
      .eq('id', customerId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (handleChanged) {
      triggerInitialTikTokSyncBackground({
        customerId: String(customerId), tiktokHandle: nextHandle, source: 'profile_link',
      });
    }

    res.json(data);
  } catch (err) {
    logger.error(err, 'studio-v2 customer profile PATCH error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/studio-v2/customers/:customerId/concepts
router.get('/customers/:customerId/concepts', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('customer_concepts')
      .select(STUDIO_CONCEPT_SELECT)
      .eq('customer_profile_id', customerId)
      .order('added_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const rawData = data || [];
    const reconciledByTarget = new Map<string, typeof rawData[number]>();
    for (const row of rawData) {
      if (!row.concept_id && row.reconciled_customer_concept_id) {
        reconciledByTarget.set(row.reconciled_customer_concept_id, row);
      }
    }

    const enrichedData = rawData
      .filter((row) => {
        if (row.concept_id) return true;
        return !row.reconciled_customer_concept_id;
      })
      .map((row) => {
        if (row.concept_id && typeof row.feed_order === 'number' && row.feed_order < 0) {
          const importedStats = reconciledByTarget.get(row.id);
          if (importedStats) {
            return {
              ...row,
              tiktok_url: importedStats.tiktok_url ?? row.tiktok_url,
              tiktok_thumbnail_url: importedStats.tiktok_thumbnail_url ?? row.tiktok_thumbnail_url,
              tiktok_views: importedStats.tiktok_views ?? row.tiktok_views,
              tiktok_likes: importedStats.tiktok_likes ?? row.tiktok_likes,
            };
          }
        }
        return row;
      });

    res.json({ concepts: enrichedData });
  } catch (err) {
    logger.error(err, 'studio-v2 customer concepts GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/studio-v2/customers/:customerId/concepts
router.post('/customers/:customerId/concepts', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const conceptId = typeof body.concept_id === 'string' ? body.concept_id.trim() : '';
    const visualVariantRaw = typeof body.visual_variant === 'string' ? body.visual_variant.trim() : '';
    const isCollaboration = visualVariantRaw === 'collaboration';
    if (!conceptId && !isCollaboration) {
      res.status(400).json({ error: 'concept_id is required' });
      return;
    }
    const feedOrder = typeof body.feed_order === 'number'
      ? body.feed_order
      : isCollaboration ? null : 1;
    const cmId = req.user!.id;

    const insert: Record<string, unknown> = {
      customer_profile_id: customerId,
      customer_id: customerId,
      concept_id: conceptId || null,
      cm_id: cmId,
      feed_order: feedOrder,
      status: isCollaboration ? 'draft' : 'assigned',
      match_percentage: typeof body.match_percentage === 'number' ? body.match_percentage : null,
      cm_note: typeof body.cm_note === 'string' ? body.cm_note : null,
      content_overrides: typeof body.content_overrides === 'object' && body.content_overrides ? body.content_overrides : {},
      added_at: new Date().toISOString(),
    };

    if (isCollaboration) {
      insert.visual_variant = 'collaboration';
      insert.partner_name = typeof body.partner_name === 'string' ? body.partner_name.trim() || null : null;
      insert.collaborator_reach = typeof body.collaborator_reach === 'string' ? body.collaborator_reach.trim() || null : null;
      insert.collaborator_avatar_url = typeof body.collaborator_avatar_url === 'string' ? body.collaborator_avatar_url.trim() || null : null;
      insert.scope = sanitizeScope(body.scope);
      insert.price = sanitizePrice(body.price);
      insert.confirmed = body.confirmed === true;
      insert.collaboration_note = typeof body.collaboration_note === 'string' ? body.collaboration_note : null;
      insert.collaboration_date_type = sanitizeCollaborationDateType(body.collaboration_date_type);
      if (typeof body.planned_publish_at === 'string' && body.planned_publish_at.trim()) {
        insert.planned_publish_at = body.planned_publish_at;
      }
    }

    const { data, error } = await supabase
      .from('customer_concepts')
      .insert(insert)
      .select(STUDIO_CONCEPT_SELECT)
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(201).json({ concept: data });
  } catch (err) {
    logger.error(err, 'studio-v2 customer concepts POST error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/studio-v2/customers/:customerId/game-plan
router.get('/customers/:customerId/game-plan', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const supabase = createSupabaseAdmin();

    const { data: cp, error: cpError } = await supabase
      .from('customer_profiles')
      .select('game_plan')
      .eq('id', customerId)
      .single();

    if (cpError || !cp) {
      res.status(404).json({ error: 'Kundprofil hittades inte' });
      return;
    }

    const { data: gpRecord } = await supabase
      .from('customer_game_plans')
      .select('customer_id, html, plain_text, editor_version, updated_by, created_at, updated_at')
      .eq('customer_id', customerId)
      .maybeSingle();

    const html = gpRecord?.html ?? ((cp as Record<string, unknown>).game_plan as string | null) ?? '';
    res.json({
      game_plan: {
        html,
        plain_text: gpRecord?.plain_text ?? null,
        editor_version: gpRecord?.editor_version ?? null,
        updated_at: gpRecord?.updated_at ?? null,
        updated_by: gpRecord?.updated_by ?? null,
      },
    });
  } catch (err) {
    logger.error(err, 'studio-v2 game-plan GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PUT /api/studio-v2/customers/:customerId/game-plan
router.put('/customers/:customerId/game-plan', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const html = typeof body.html === 'string' ? body.html : '';
    const userId = req.user!.id;
    const now = new Date().toISOString();

    const upsertPayload = {
      customer_id: customerId,
      html,
      plain_text: typeof body.plain_text === 'string' ? body.plain_text : '',
      editor_version: typeof body.editor_version === 'string' ? body.editor_version : '2',
      updated_by: userId,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from('customer_game_plans')
      .upsert(upsertPayload, { onConflict: 'customer_id' })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Mirror legacy field
    await supabase.from('customer_profiles').update({ game_plan: html }).eq('id', customerId);

    res.json({ game_plan: data });
  } catch (err) {
    logger.error(err, 'studio-v2 game-plan PUT error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/studio-v2/customers/:customerId/notes
router.get('/customers/:customerId/notes', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('customer_notes')
      .select('id, customer_id, cm_id, content, content_html, note_type, primary_customer_concept_id, references, attachments, created_at, updated_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ notes: data ?? [] });
  } catch (err) {
    logger.error(err, 'studio-v2 customer notes GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/studio-v2/customers/:customerId/notes
router.post('/customers/:customerId/notes', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const contentHtml = typeof body.content_html === 'string' ? body.content_html : null;
    if (!content && !contentHtml) {
      res.status(400).json({ error: 'Note content is required' });
      return;
    }
    const { data, error } = await supabase
      .from('customer_notes')
      .insert({
        customer_id: customerId,
        cm_id: req.user!.id,
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
    logger.error(err, 'studio-v2 customer notes POST error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/studio-v2/customers/:customerId/brief
router.get('/customers/:customerId/brief', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('customer_profiles')
      .select('brief')
      .eq('id', customerId)
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ brief: (data as Record<string, unknown> | null)?.brief ?? null });
  } catch (err) {
    logger.error(err, 'studio-v2 customer brief GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PUT /api/studio-v2/customers/:customerId/brief
router.put('/customers/:customerId/brief', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();

    // Resolve the brief field
    const briefSource = (body.brief && typeof body.brief === 'object' && !Array.isArray(body.brief))
      ? body.brief as Record<string, unknown>
      : body;

    const patch: Record<string, unknown> = {};
    const allowed = ['tone', 'constraints', 'current_focus', 'posting_weekdays'] as const;
    for (const key of allowed) {
      if (key in briefSource) patch[key] = briefSource[key];
    }

    const { data: existing } = await supabase
      .from('customer_profiles')
      .select('brief')
      .eq('id', customerId)
      .single();

    const existingBrief = (existing as Record<string, unknown> | null)?.brief ?? {};
    const newBrief = typeof existingBrief === 'object' && existingBrief !== null
      ? { ...existingBrief as Record<string, unknown>, ...patch }
      : patch;

    const { data, error } = await supabase
      .from('customer_profiles')
      .update({ brief: newBrief, updated_at: new Date().toISOString() })
      .eq('id', customerId)
      .select('brief')
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ brief: (data as Record<string, unknown>).brief });
  } catch (err) {
    logger.error(err, 'studio-v2 customer brief PUT error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/studio-v2/customers/:customerId/advance-plan (deprecated)
router.post('/customers/:customerId/advance-plan', requireAuth, CM_ONLY, (_req, res) => {
  res.status(410).json({ error: 'advance-plan is deprecated. Use /api/studio-v2/feed/mark-produced instead.' });
});

// GET /api/studio-v2/customers/:customerId/import-history
router.get('/customers/:customerId/import-history', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('customer_concepts')
      .select(STUDIO_CONCEPT_SELECT)
      .eq('customer_profile_id', customerId)
      .is('concept_id', null)
      .order('added_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ concepts: data ?? [] });
  } catch (err) {
    logger.error(err, 'studio-v2 import-history error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/studio-v2/internal/sync-history-all
// Bearer-token-only cron route. Triggered by the GitHub Actions workflow.
router.post('/internal/sync-history-all', async (req, res) => {
  try {
    const cronSecret = process.env['CRON_SECRET'];
    if (!cronSecret) {
      res.status(500).json({ error: 'CRON_SECRET not configured' });
      return;
    }
    const auth = req.headers['authorization'] ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const rapidApiKey = process.env['RAPIDAPI_KEY'];
    if (!rapidApiKey) {
      res.status(500).json({ error: 'RAPIDAPI_KEY not configured' });
      return;
    }
    const result = await runHistorySyncBatch(rapidApiKey);
    res.json(result);
  } catch (err) {
    logger.error(err, 'sync-history-all cron error');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internt serverfel' });
  }
});

// POST /api/studio-v2/customers/:customerId/fetch-profile-history
// Manual "Hämta historik"-knapp i Studio-UI. Hämtar fler sidor än cron-batchen.
router.post('/customers/:customerId/fetch-profile-history', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const customerId = String(req.params['customerId'] ?? '');
    if (!customerId) {
      res.status(400).json({ error: 'customerId krävs' });
      return;
    }
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const rapidApiKey = process.env['RAPIDAPI_KEY'];
    if (!rapidApiKey) {
      res.status(500).json({ error: 'RAPIDAPI_KEY not configured' });
      return;
    }
    const supabase = createSupabaseAdmin();
    const { data: customer, error: customerError } = await supabase
      .from('customer_profiles')
      .select('tiktok_handle')
      .eq('id', customerId)
      .maybeSingle();
    if (customerError || !customer) {
      res.status(404).json({ error: 'Kunden hittades inte' });
      return;
    }
    const handleRaw = customer.tiktok_handle as unknown;
    const handle = typeof handleRaw === 'string' ? handleRaw.trim().replace(/^@/, '') : '';
    if (!handle) {
      res.status(400).json({ error: 'Kunden saknar TikTok-handle' });
      return;
    }
    // Studio UI passes { count, cursor } for "Hämta historik" / load-more.
    // We accept either { count, cursor } (single-page pagination) or { pages }
    // (multi-page bulk fetch). Both are bounded for cost safety.
    const body = (req.body ?? {}) as { count?: number; cursor?: number; pages?: number };
    const rawCount = Math.floor(Number(body.count));
    const count = Number.isFinite(rawCount) && rawCount >= 1 ? Math.min(50, rawCount) : 10;
    const rawCursor = Math.floor(Number(body.cursor));
    const startCursor = Number.isFinite(rawCursor) && rawCursor > 0 ? rawCursor : undefined;
    const rawPages = Math.floor(Number(body.pages));
    const pages = Number.isFinite(rawPages) && rawPages >= 1 ? Math.min(10, rawPages) : 1;
    const result = await syncCustomerHistory(supabase, customerId, handle, rapidApiKey, {
      mode: 'manual', pages, pageSize: count, startCursor,
    });
    res.json(result);
  } catch (err) {
    logger.error(err, 'fetch-profile-history error');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internt serverfel' });
  }
});

// GET /api/studio-v2/customers/:customerId/sync-history
router.get('/customers/:customerId/sync-history', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const supabase = createSupabaseAdmin();
    const { data, error } = await (supabase as any)
      .from('tiktok_sync_history')
      .select('*')
      .eq('customer_id', customerId)
      .order('synced_at', { ascending: false })
      .limit(50)
;

    if (error) {
      res.json({ history: [] });
      return;
    }
    res.json({ history: data ?? [] });
  } catch (err) {
    logger.error(err, 'studio-v2 sync-history error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/studio-v2/customers/:customerId/hagen-clips
router.get('/customers/:customerId/hagen-clips', requireAuth, CM_ONLY, async (req, res) => {
  const { customerId } = req.params;
  if (!(await ensureCustomerAccess(req, res, customerId))) return;
  if (!getHagenBase()) {
    res.json({ clips: [] });
    return;
  }
  await proxyHagenJson(res, {
    method: 'GET',
    path: `/api/studio-v2/customers/${customerId}/hagen-clips`,
    timeoutMs: 8000,
    routeTag: 'studio-v2.hagen-clips',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Feed Spans
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/studio-v2/feed-spans
router.get('/feed-spans', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const customerId = req.query['customer_id'] as string | undefined;
    if (!customerId) {
      res.status(400).json({ error: 'customer_id is required' });
      return;
    }
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const historyOffset = Number(req.query['history_offset'] ?? 0);
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('feed_spans')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ spans: data ?? [] });
  } catch (err) {
    logger.error(err, 'studio-v2 feed-spans GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/studio-v2/feed-spans
router.post('/feed-spans', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const customerId = typeof body.customer_id === 'string' ? body.customer_id.trim() : '';
    if (!customerId) {
      res.status(400).json({ error: 'customer_id is required' });
      return;
    }
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const supabase = createSupabaseAdmin();
    const insert = {
      customer_id: customerId,
      label: typeof body.label === 'string' ? body.label : null,
      color: typeof body.color === 'string' ? body.color : null,
      start_feed_order: typeof body.start_feed_order === 'number' ? body.start_feed_order : null,
      end_feed_order: typeof body.end_feed_order === 'number' ? body.end_feed_order : null,
      created_by: req.user!.id,
    };
    const { data, error } = await supabase
      .from('feed_spans')
      .insert(insert)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(201).json({ span: data });
  } catch (err) {
    logger.error(err, 'studio-v2 feed-spans POST error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PATCH /api/studio-v2/feed-spans/:spanId
router.patch('/feed-spans/:spanId', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { spanId } = req.params;
    const supabase = createSupabaseAdmin();
    const { data: spanRow } = await supabase
      .from('feed_spans').select('customer_id').eq('id', spanId).maybeSingle();
    if (!spanRow) {
      res.status(404).json({ error: 'Spann hittades inte' });
      return;
    }
    if (!(await ensureCustomerAccess(req, res, (spanRow as { customer_id: string }).customer_id))) return;
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['label', 'color', 'start_feed_order', 'end_feed_order', 'frac_start', 'frac_end'];
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }
    const { data, error } = await supabase
      .from('feed_spans')
      .update(patch)
      .eq('id', spanId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ span: data });
  } catch (err) {
    logger.error(err, 'studio-v2 feed-spans PATCH error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// DELETE /api/studio-v2/feed-spans/:spanId
router.delete('/feed-spans/:spanId', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { spanId } = req.params;
    const supabase = createSupabaseAdmin();
    const { data: spanRow } = await supabase
      .from('feed_spans').select('customer_id').eq('id', spanId).maybeSingle();
    if (!spanRow) {
      res.status(404).json({ error: 'Spann hittades inte' });
      return;
    }
    if (!(await ensureCustomerAccess(req, res, (spanRow as { customer_id: string }).customer_id))) return;
    const { error } = await supabase.from('feed_spans').delete().eq('id', spanId);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'studio-v2 feed-spans DELETE error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Feed: Mark Produced
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/studio-v2/feed/mark-produced
router.post('/feed/mark-produced', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const conceptId = typeof body.concept_id === 'string' ? body.concept_id.trim() : '';
    const customerId = typeof body.customer_id === 'string' ? body.customer_id.trim() : '';
    const tiktokUrl = typeof body.tiktok_url === 'string' ? body.tiktok_url : null;
    const publishedAt = typeof body.published_at === 'string' ? body.published_at : null;
    const now = new Date().toISOString();

    if (!conceptId) {
      res.status(400).json({ error: 'concept_id is required' });
      return;
    }
    if (!customerId) {
      res.status(400).json({ error: 'customer_id is required' });
      return;
    }
    if (!(await ensureCustomerAccess(req, res, customerId))) return;

    const supabase = createSupabaseAdmin();

    // Mark current concept (feed_order 0) as produced
    const { error: updateError } = await supabase
      .from('customer_concepts')
      .update({
        status: 'produced',
        produced_at: now,
        published_at: publishedAt,
        tiktok_url: tiktokUrl,
        feed_order: -1,
      })
      .eq('id', conceptId)
      .eq('customer_profile_id', customerId);

    if (updateError) {
      res.status(500).json({ error: updateError.message });
      return;
    }

    // Advance the planning window: shift all upcoming concepts down by 1
    const { data: upcoming } = await supabase
      .from('customer_concepts')
      .select('id, feed_order')
      .eq('customer_profile_id', customerId)
      .gt('feed_order', 0)
      .order('feed_order', { ascending: true });

    if (upcoming && upcoming.length > 0) {
      // Move first upcoming concept to now slot (0)
      await supabase
        .from('customer_concepts')
        .update({ feed_order: 0 })
        .eq('id', upcoming[0].id);

      // Shift rest down
      for (let i = 1; i < upcoming.length; i++) {
        await supabase
          .from('customer_concepts')
          .update({ feed_order: (upcoming[i].feed_order as number) - 1 })
          .eq('id', upcoming[i].id);
      }
    }

    // Return updated concept
    const { data, error: fetchError } = await supabase
      .from('customer_concepts')
      .select(STUDIO_CONCEPT_SELECT)
      .eq('id', conceptId)
      .eq('customer_profile_id', customerId)
      .maybeSingle();

    if (fetchError) {
      res.status(500).json({ error: fetchError.message });
      return;
    }

    res.json({ success: true, concept: data });
  } catch (err) {
    logger.error(err, 'studio-v2 feed mark-produced error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Email
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/studio-v2/email/preview
router.post('/email/preview', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    // Stub: return a preview based on available data
    const subject = typeof body.subject === 'string' ? body.subject : 'Förhandsgranskning';
    const html = typeof body.html === 'string' ? body.html : '<p>E-postinnehåll</p>';
    res.json({ subject, html });
  } catch (err) {
    logger.error(err, 'studio-v2 email preview error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/studio-v2/email/send
router.post('/email/send', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const customerId = typeof body.customer_id === 'string' ? body.customer_id.trim() : '';

    if (!customerId) {
      res.status(400).json({ error: 'customer_id is required' });
      return;
    }
    if (!(await ensureCustomerAccess(req, res, customerId))) return;

    const resendApiKey = process.env['RESEND_API_KEY'];
    const fromEmail = process.env['RESEND_FROM_EMAIL'] ?? 'LeTrend <hej@letrend.se>';

    if (!resendApiKey) {
      // Log the send without actually sending
      await (supabase as any)
        .from('email_log')
        .insert({
          customer_id: customerId,
          cm_id: req.user!.id,
          subject: typeof body.subject === 'string' ? body.subject : '',
          status: 'skipped_no_api_key',
          sent_at: new Date().toISOString(),
        })
        .catch(() => {});
      res.json({ success: true, skipped: true, reason: 'RESEND_API_KEY not configured' });
      return;
    }

    const subject = typeof body.subject === 'string' ? body.subject : 'Uppdatering från LeTrend';
    const html = typeof body.html === 'string' ? body.html : '';
    const toEmail = typeof body.to === 'string' ? body.to : null;

    if (!toEmail) {
      res.status(400).json({ error: 'to email is required' });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – resend is an optional runtime dependency
    const Resend = (await import('resend').catch(() => null)) as { Resend: new (key: string) => { emails: { send: (opts: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> } } } | null;
    if (!Resend) {
      res.status(503).json({ error: 'Resend package not available' });
      return;
    }
    const resend = new Resend.Resend(resendApiKey);
    const { data: sendData, error: sendError } = await resend.emails.send({
      from: fromEmail, to: [toEmail], subject, html,
    });

    if (sendError) {
      res.status(500).json({ error: 'Kunde inte skicka e-post' });
      return;
    }

    await (supabase as any)
      .from('email_log')
      .insert({ customer_id: customerId, cm_id: req.user!.id, subject, status: 'sent', sent_at: new Date().toISOString() })
      .catch(() => {});

    res.json({ success: true, data: sendData });
  } catch (err) {
    logger.error(err, 'studio-v2 email send error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/studio-v2/email/jobs
router.get('/email/jobs', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const customerId = req.query['customer_id'] as string | undefined;
    const limit = Math.min(Number(req.query['limit'] ?? 10), 100);
    const isAdmin = Boolean(req.user?.is_admin || req.user?.role === 'admin');
    if (customerId) {
      if (!(await ensureCustomerAccess(req, res, customerId))) return;
    } else if (!isAdmin) {
      res.status(400).json({ error: 'customer_id is required' });
      return;
    }

    let query = (supabase as any)
      .from('email_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (customerId) query = query.eq('customer_id', customerId);

    const { data, error } = await query;
    if (error) {
      res.json({ jobs: [] });
      return;
    }
    res.json({ jobs: data ?? [] });
  } catch (err) {
    logger.error(err, 'studio-v2 email jobs GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/studio-v2/email/jobs/:jobId
router.get('/email/jobs/:jobId', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await (supabase as any)
      .from('email_jobs')
      .select('*')
      .eq('id', req.params['jobId'])
      .single()
;

    if (error || !data) {
      res.status(404).json({ error: 'E-postjobb hittades inte' });
      return;
    }
    if (!(await ensureCustomerAccess(req, res, (data as { customer_id?: string }).customer_id))) return;
    res.json({ job: data });
  } catch (err) {
    logger.error(err, 'studio-v2 email job by id error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PATCH /api/studio-v2/email/jobs/:jobId
router.patch('/email/jobs/:jobId', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { data: jobRow } = await (supabase as any)
      .from('email_jobs').select('customer_id').eq('id', req.params['jobId']).maybeSingle();
    if (!jobRow) {
      res.status(404).json({ error: 'E-postjobb hittades inte' });
      return;
    }
    if (!(await ensureCustomerAccess(req, res, (jobRow as { customer_id?: string }).customer_id))) return;
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['status', 'error_message', 'sent_at'];
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }
    const { data, error } = await (supabase as any)
      .from('email_jobs')
      .update(patch)
      .eq('id', req.params['jobId'])
      .select()
      .single()
;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ job: data });
  } catch (err) {
    logger.error(err, 'studio-v2 email job PATCH error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// History Reconciliation
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/studio-v2/history/reconciliation
router.post('/history/reconciliation', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const historyConceptId = typeof body.history_concept_id === 'string' ? body.history_concept_id.trim() : '';
    const mode = body.mode === 'use_now_slot' ? 'use_now_slot' : 'manual';
    const linkedConceptId = typeof body.linked_customer_concept_id === 'string' ? body.linked_customer_concept_id.trim() : '';

    if (!historyConceptId) {
      res.status(400).json({ error: 'history_concept_id is required' });
      return;
    }
    if (mode !== 'use_now_slot' && !linkedConceptId) {
      res.status(400).json({ error: 'linked_customer_concept_id is required' });
      return;
    }

    const { data: historyRow, error: histErr } = await supabase
      .from('customer_concepts')
      .select('id, customer_profile_id, concept_id')
      .eq('id', historyConceptId)
      .maybeSingle();

    if (histErr) {
      res.status(500).json({ error: histErr.message });
      return;
    }
    if (!historyRow) {
      res.status(404).json({ error: 'Imported history row not found' });
      return;
    }
    if (!(await ensureCustomerAccess(req, res, (historyRow as { customer_profile_id: string }).customer_profile_id))) return;
    if ((historyRow as Record<string, unknown>).concept_id) {
      res.status(409).json({ error: 'Only imported TikTok history can be reconciled' });
      return;
    }

    const now = new Date().toISOString();
    const { error: reconcileError } = await supabase
      .from('customer_concepts')
      .update({
        reconciled_customer_concept_id: linkedConceptId || null,
        reconciled_by_cm_id: req.user!.id,
        reconciled_at: now,
      })
      .eq('id', historyConceptId);

    if (reconcileError) {
      res.status(500).json({ error: reconcileError.message });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'studio-v2 history reconciliation error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Concepts (library-level)
// ─────────────────────────────────────────────────────────────────────────────

// PATCH /api/studio-v2/library-concepts/:conceptId
// Patches the overrides JSONB on the concepts library table.
// Accepts either a DB UUID or the backend clip ID (backend_data->>'id').
router.patch('/library-concepts/:conceptId', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { conceptId } = req.params;
    const supabase = createSupabaseAdmin();
    const body = req.body as Record<string, unknown>;

    // Try to find by DB UUID first, then fall back to backend clip id.
    let row: { id: string; overrides: unknown } | null = null;

    const byUuid = await supabase
      .from('concepts')
      .select('id, overrides')
      .eq('id', conceptId)
      .maybeSingle();

    if (byUuid.error && byUuid.error.code !== 'PGRST116') {
      // PGRST116 = no rows found (not an error), anything else is a DB problem
      res.status(500).json({ error: byUuid.error.message });
      return;
    }

    if (byUuid.data) {
      row = byUuid.data as { id: string; overrides: unknown };
    } else {
      // conceptId is a clip JSON id stored inside backend_data->>'id'
      const byClipId = await (supabase as any)
        .from('concepts')
        .select('id, overrides')
        .filter('backend_data->>id', 'eq', conceptId)
        .maybeSingle();
      if (byClipId.error && byClipId.error.code !== 'PGRST116') {
        res.status(500).json({ error: byClipId.error.message });
        return;
      }
      if (byClipId.data) {
        row = byClipId.data as { id: string; overrides: unknown };
      }
    }

    if (!row) {
      res.status(404).json({ error: 'Konceptet hittades inte' });
      return;
    }

    const existingOverrides = (typeof row.overrides === 'object' && row.overrides !== null)
      ? row.overrides as Record<string, unknown>
      : {};

    // Merge allowed override fields
    const patch: Record<string, unknown> = { ...existingOverrides };
    if (typeof body.headline_sv === 'string') patch.headline_sv = body.headline_sv;
    if (typeof body.difficulty === 'string') patch.difficulty = body.difficulty;
    if (typeof body.trend_level === 'number') patch.trendLevel = body.trend_level;
    if (typeof body.film_time === 'string') patch.filmTime = body.film_time;
    if (typeof body.people_needed === 'string') patch.peopleNeeded = body.people_needed;
    if (typeof body.why_it_works === 'string') patch.whyItWorks_sv = body.why_it_works;
    if (typeof body.target_audience === 'string') patch.targetAudience_sv = body.target_audience;

    const { error: updateError } = await supabase
      .from('concepts')
      .update({ overrides: patch, updated_at: new Date().toISOString() })
      .eq('id', (row as { id: string }).id);

    if (updateError) {
      res.status(500).json({ error: updateError.message });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'studio-v2 library-concepts PATCH error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PATCH /api/studio-v2/concepts/:conceptId
router.patch('/concepts/:conceptId', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { conceptId } = req.params;
    const supabase = createSupabaseAdmin();
    const { data: cc } = await supabase
      .from('customer_concepts').select('customer_profile_id').eq('id', conceptId).maybeSingle();
    if (!cc) {
      res.status(404).json({ error: 'Koncept hittades inte' });
      return;
    }
    if (!(await ensureCustomerAccess(req, res, (cc as { customer_profile_id: string }).customer_profile_id))) return;
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = [
      'status', 'content_overrides', 'cm_note', 'tiktok_url', 'tiktok_thumbnail_url',
      'tiktok_views', 'tiktok_likes', 'published_at', 'produced_at', 'feed_order',
      'planned_publish_at',
      'partner_name', 'profile_name', 'profile_image_url', 'visual_variant',
      'collaborator_reach', 'collaborator_avatar_url', 'collaboration_note',
    ];
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }
    if ('scope' in body) patch.scope = sanitizeScope(body.scope);
    if ('price' in body) patch.price = sanitizePrice(body.price);
    if ('confirmed' in body) patch.confirmed = body.confirmed === true;
    if ('collaboration_date_type' in body) patch.collaboration_date_type = sanitizeCollaborationDateType(body.collaboration_date_type);

    const { data, error } = await supabase
      .from('customer_concepts')
      .update(patch)
      .eq('id', conceptId)
      .select(STUDIO_CONCEPT_SELECT)
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ concept: data });
  } catch (err) {
    logger.error(err, 'studio-v2 concept PATCH error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// DELETE /api/studio-v2/concepts/:conceptId
router.delete('/concepts/:conceptId', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { conceptId } = req.params;
    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('customer_concepts')
      .update({ status: 'archived', feed_order: null })
      .eq('id', conceptId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'studio-v2 concept DELETE error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/studio-v2/dashboard
router.get('/dashboard', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const userId = req.user!.id;

    const [conceptsResult, customersResult, pendingResult, myCustomersResult] = await Promise.all([
      supabase.from('concepts').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('customer_profiles').select('*', { count: 'exact', head: true }),
      supabase.from('customer_profiles').select('*', { count: 'exact', head: true }).in('status', ['agreement_sent', 'invited', 'pending']),
      supabase.from('customer_profiles').select('id, business_name, status, created_at').eq('account_manager_profile_id', userId).order('created_at', { ascending: false }).limit(5),
    ]);

    res.json({
      totalConcepts: conceptsResult.count ?? 0,
      totalCustomers: customersResult.count ?? 0,
      pendingCustomers: pendingResult.count ?? 0,
      myRecentCustomers: myCustomersResult.data ?? [],
    });
  } catch (err) {
    logger.error(err, 'studio-v2 dashboard error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
