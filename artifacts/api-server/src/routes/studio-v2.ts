import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ensureCustomerAccess } from '../middleware/cm-access.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { buildGamePlanInput, generateGamePlanDraft } from '../lib/game-plan-generate.js';
import { refreshReconciledThumbnails, runHistorySyncBatch, syncCustomerHistory, triggerInitialTikTokSyncBackground } from '../lib/studio/tiktok-sync.js';
import { rankCandidates } from '../lib/studio/reconciliation-scoring.js';
import {
  generateReconciliationCandidates,
  backfillReconciliationCandidates,
} from '../lib/studio/reconciliation-candidates.js';
import {
  confirmPublishedConcept,
  undoConfirmedConcept,
} from '../lib/studio/confirm-published-concept.js';
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

function isPlannedUpcomingFeedRow(row: Record<string, unknown>): boolean {
  const status = typeof row.status === 'string' ? row.status : null;
  const rowKind = typeof row.row_kind === 'string' ? row.row_kind : null;
  return (
    typeof row.feed_order === 'number'
    && row.feed_order > 0
    && status !== 'produced'
    && status !== 'archived'
    && status !== 'history_import'
    && rowKind !== 'history_import'
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Customers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    // Collect unique account_manager_profile_ids to enrich with team member data
    const cmProfileIds = [
      ...new Set(
        (profiles ?? [])
          .map((p) => p.account_manager_profile_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [conceptsResult, emailsResult, teamMembersResult, nextPlannedResult] = await Promise.all([
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
        .limit(customerIds.length * 5),
      cmProfileIds.length > 0
        ? supabase
            .from('team_members')
            .select('profile_id, name, avatar_url, city, region')
            .in('profile_id', cmProfileIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from('customer_concepts')
        .select('customer_profile_id, planned_publish_at')
        .in('customer_profile_id', customerIds)
        .not('planned_publish_at', 'is', null)
        .gte('planned_publish_at', new Date().toISOString())
        .order('planned_publish_at', { ascending: true }),
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

    // Build CM identity map keyed by profile_id
    const cmIdentityMap = new Map<string, { name: string; avatar_url: string | null; city: string | null; region: string | null }>();
    for (const member of (teamMembersResult.data ?? [])) {
      if (member.profile_id) {
        cmIdentityMap.set(member.profile_id as string, {
          name: member.name as string,
          avatar_url: (member.avatar_url as string | null) ?? null,
          city: (member.city as string | null) ?? null,
          region: (member.region as string | null) ?? null,
        });
      }
    }

    // Build next planned delivery map (earliest future planned_publish_at per customer)
    const nextPlannedMap = new Map<string, string>();
    for (const row of (nextPlannedResult.data ?? [])) {
      const cid = row.customer_profile_id as string;
      if (!nextPlannedMap.has(cid)) {
        nextPlannedMap.set(cid, row.planned_publish_at as string);
      }
    }

    const customers = (profiles ?? []).map((p) => {
      const cmId = p.account_manager_profile_id as string | null;
      const cmIdentity = cmId ? cmIdentityMap.get(cmId) : undefined;
      return {
        ...p,
        concept_stats: conceptStatsMap.get(p.id) ?? { draft: 0, sent: 0, produced: 0 },
        last_email_sent_at: lastEmailMap.get(p.id) ?? null,
        account_manager_display_name: cmIdentity?.name ?? (p.account_manager as string | null) ?? null,
        account_manager_avatar_url: cmIdentity?.avatar_url ?? null,
        account_manager_city: cmIdentity?.city ?? cmIdentity?.region ?? null,
        next_planned_at: nextPlannedMap.get(p.id) ?? null,
      };
    });

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
        // Overlay thumbnail + stats from reconciled imported_history row onto any
        // assignment row that has a linked history clip â€” not just past (feed_order < 0)
        // ones, so the Nu slot and future planned slots also surface the thumbnail.
        if (row.concept_id) {
          const importedStats = reconciledByTarget.get(row.id);
          if (importedStats) {
            return {
              ...row,
              tiktok_url: importedStats.tiktok_url ?? row.tiktok_url,
              tiktok_thumbnail_url: importedStats.tiktok_thumbnail_url ?? row.tiktok_thumbnail_url,
              tiktok_views: importedStats.tiktok_views ?? row.tiktok_views,
              tiktok_likes: importedStats.tiktok_likes ?? row.tiktok_likes,
              tiktok_comments: importedStats.tiktok_comments ?? row.tiktok_comments,
              // Overlay the real TikTok publish date so the history card shows
              // when the clip was actually uploaded, not when the CM clicked
              // "Markera som gjord".
              published_at: importedStats.published_at ?? row.published_at,
              // Inject the imported clip's own ID so the frontend can surface
              // "Ã…ngra koppling" on the LeTrend (assignment) history card.
              // The normalizer reads this as reconciliation.reconciled_clip_id.
              reconciled_imported_clip_id: importedStats.id,
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
      status: 'draft',
      match_percentage: typeof body.match_percentage === 'number' ? body.match_percentage : null,
      cm_note: typeof body.cm_note === 'string' ? body.cm_note : null,
      content_overrides: typeof body.content_overrides === 'object' && body.content_overrides ? body.content_overrides : {},
      added_at: new Date().toISOString(),
    };

    insert.row_kind = isCollaboration ? 'collaboration' : 'assignment';

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

// POST /api/studio-v2/customers/:customerId/game-plan/generate
router.post('/customers/:customerId/game-plan/generate', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;

    const result = await generateGamePlanDraft({
      input: buildGamePlanInput((req.body ?? {}) as Record<string, unknown>),
      mode: 'studio',
    });

    res.json(result);
  } catch (err) {
    logger.error(err, 'game-plan generate error');
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

// POST /api/studio-v2/internal/refresh-reconciled-thumbnails
// Bearer-token-only cron route. Sweeps all reconciled imported_history rows and
// re-mirrors the latest tiktok_thumbnail_url onto the linked assignment row.
// Accepts an optional JSON body { customerId: string } to scope to one customer.
// This runs automatically at the end of every sync-history-all batch; this
// endpoint lets it be triggered independently when needed.
router.post('/internal/refresh-reconciled-thumbnails', async (req, res) => {
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
    const body = (req.body ?? {}) as Record<string, unknown>;
    const customerId = typeof body['customerId'] === 'string' && body['customerId'] ? body['customerId'] : undefined;
    const supabase = createSupabaseAdmin();
    const result = await refreshReconciledThumbnails(supabase, customerId);
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error(err, 'refresh-reconciled-thumbnails cron error');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internt serverfel' });
  }
});

// POST /api/studio-v2/internal/backfill-reconciliation-candidates
// Bearer-token-only internal endpoint. Finds customers with unreconciled
// history_import rows and runs generateReconciliationCandidates for each one.
// Body: { dryRun?: boolean, limit?: number, customerIds?: string[] }
router.post('/internal/backfill-reconciliation-candidates', async (req, res) => {
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
    const body = (req.body ?? {}) as Record<string, unknown>;
    const dryRun = body['dryRun'] === true;
    const rawLimit = Number(body['limit']);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : undefined;
    const rawIds = body['customerIds'];
    const customerIds = Array.isArray(rawIds)
      ? (rawIds as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined;

    const supabase = createSupabaseAdmin();
    const result = await backfillReconciliationCandidates(supabase, { dryRun, limit, customerIds });
    res.json(result);
  } catch (err) {
    logger.error(err, 'backfill-reconciliation-candidates error');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internt serverfel' });
  }
});

// POST /api/studio-v2/customers/:customerId/fetch-profile-history
// Manual "HÃ¤mta historik"-knapp i Studio-UI. HÃ¤mtar fler sidor Ã¤n cron-batchen.
router.post('/customers/:customerId/fetch-profile-history', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const customerId = String(req.params['customerId'] ?? '');
    if (!customerId) {
      res.status(400).json({ error: 'customerId krÃ¤vs' });
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
    // Studio UI passes { count, cursor } for "HÃ¤mta historik" / load-more.
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feed Spans
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feed: Mark Produced
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    let advanceLockAcquired = false;

    try {
      // Acquire optimistic lock before calling RPC to prevent concurrent advances.
      const { data: lockRow, error: lockError } = await supabase
        .from('customer_profiles')
        .update({ pending_history_advance_at: now })
        .eq('id', customerId)
        .is('pending_history_advance_at', null)
        .select('id')
        .maybeSingle();

      if (lockError) {
        res.status(500).json({ error: lockError.message });
        return;
      }
      if (!lockRow) {
        res.status(409).json({ error: 'Planen flyttas redan fram. Försök igen om en stund.' });
        return;
      }
      advanceLockAcquired = true;

      // Delegate all business logic (validation + update + feed reorder) to the DB RPC.
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'advance_customer_feed_plan',
        {
          p_customer_id: customerId,
          p_concept_id: conceptId,
          p_tiktok_url: tiktokUrl,
          p_published_at: publishedAt,
          p_now: now,
        },
      );

      if (rpcError) {
        res.status(500).json({ error: rpcError.message });
        return;
      }

      // Check for soft error encoded in returned JSONB.
      const rpcData = rpcResult as Record<string, unknown> | null;
      const errorCode =
        rpcData && typeof rpcData['error_code'] === 'string' ? rpcData['error_code'] : null;

      if (errorCode) {
        const statusMap: Record<string, number> = {
          customer_not_found: 404,
          concept_not_found: 404,
          already_produced: 409,
          not_current_slot: 409,
          history_import_not_plannable: 409,
          unsupported_row_kind: 409,
          invalid_status: 409,
        };
        const messageMap: Record<string, string> = {
          customer_not_found: 'Kunden hittades inte',
          concept_not_found: 'Konceptet hittades inte',
          already_produced: 'Konceptet är redan markerat som producerat',
          not_current_slot: 'Endast nu-slotten kan markeras som producerad',
          history_import_not_plannable: 'Importerad historik kan inte markeras som producerad',
          unsupported_row_kind: 'Endast planerade koncept kan markeras som producerade',
          invalid_status: 'Endast planerade koncept kan markeras som producerade',
        };
        const httpStatus = statusMap[errorCode] ?? 500;
        const rpcMessage =
          typeof rpcData?.['message'] === 'string' ? rpcData['message'] : 'Internt serverfel';
        res.status(httpStatus).json({ error: messageMap[errorCode] ?? rpcMessage });
        return;
      }

      // RPC succeeded — fetch fresh produced concept for the response.
      const { data: producedConcept, error: fetchError } = await supabase
        .from('customer_concepts')
        .select(STUDIO_CONCEPT_SELECT)
        .eq('id', conceptId)
        .eq('customer_profile_id', customerId)
        .maybeSingle();

      if (fetchError) {
        res.status(500).json({ error: fetchError.message });
        return;
      }
      if (!producedConcept) {
        res.status(409).json({ error: 'Konceptet kunde inte hämtas efter produktion.' });
        return;
      }

      // Auto-resolve any open feed motor signals for this customer.
      const { error: signalError } = await supabase
        .from('feed_motor_signals')
        .update({ auto_resolved_at: now })
        .eq('customer_id', customerId)
        .is('acknowledged_at', null)
        .is('auto_resolved_at', null);

      if (signalError) {
        logger.warn({ err: signalError, customerId }, 'failed to auto-resolve feed motor signals');
      }

      res.json({ success: true, concept: producedConcept });
    } finally {
      if (advanceLockAcquired) {
        const { error: unlockError } = await supabase
          .from('customer_profiles')
          .update({ pending_history_advance_at: null })
          .eq('id', customerId);

        if (unlockError) {
          logger.warn({ err: unlockError, customerId }, 'failed to clear feed advance lock');
        }
      }
    }
  } catch (err) {
    logger.error(err, 'studio-v2 feed mark-produced error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Email
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// POST /api/studio-v2/email/preview
router.post('/email/preview', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    // Stub: return a preview based on available data
    const subject = typeof body.subject === 'string' ? body.subject : 'FÃ¶rhandsgranskning';
    const html = typeof body.html === 'string' ? body.html : '<p>E-postinnehÃ¥ll</p>';
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

    const subject = typeof body.subject === 'string' ? body.subject : 'Uppdatering frÃ¥n LeTrend';
    const html = typeof body.html === 'string' ? body.html : '';
    const toEmail = typeof body.to === 'string' ? body.to : null;

    if (!toEmail) {
      res.status(400).json({ error: 'to email is required' });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore â€“ resend is an optional runtime dependency
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// History Reconciliation
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    const historyCustomerId = (historyRow as { customer_profile_id: string }).customer_profile_id;
    if (!(await ensureCustomerAccess(req, res, historyCustomerId))) return;
    if ((historyRow as Record<string, unknown>).concept_id) {
      res.status(409).json({ error: 'Only imported TikTok history can be reconciled' });
      return;
    }

    // Resolve the target assignment concept ID.
    // mode=use_now_slot: look up the assignment at feed_order=0 for this customer.
    // mode=manual: use the explicitly provided linked_customer_concept_id.
    let resolvedLinkedConceptId = linkedConceptId;
    if (mode === 'use_now_slot') {
      const { data: nowSlot } = await supabase
        .from('customer_concepts')
        .select('id')
        .eq('customer_profile_id', historyCustomerId)
        .eq('feed_order', 0)
        .not('concept_id', 'is', null)
        .maybeSingle();
      if (!nowSlot) {
        res.status(422).json({ error: 'Inget koncept i nu-slotten hittades. Välj manuellt.' });
        return;
      }
      resolvedLinkedConceptId = (nowSlot as { id: string }).id;
    }

    if (!resolvedLinkedConceptId) {
      res.status(400).json({ error: 'linked_customer_concept_id is required' });
      return;
    }

    // Validate that the target assignment row belongs to the same customer and
    // is an actual assignment (has concept_id). This prevents a CM with access
    // to customer A from writing to an assignment row belonging to customer B.
    const { data: assignmentRow, error: assignmentErr } = await supabase
      .from('customer_concepts')
      .select('id, customer_profile_id, concept_id')
      .eq('id', resolvedLinkedConceptId)
      .maybeSingle();
    if (assignmentErr) {
      res.status(500).json({ error: assignmentErr.message });
      return;
    }
    if (!assignmentRow) {
      res.status(404).json({ error: 'Target assignment concept not found' });
      return;
    }
    const typedAssignmentRow = assignmentRow as { customer_profile_id: string; concept_id: unknown };
    if (typedAssignmentRow.customer_profile_id !== historyCustomerId) {
      res.status(403).json({ error: 'Target concept belongs to a different customer' });
      return;
    }
    if (!typedAssignmentRow.concept_id) {
      res.status(422).json({ error: 'Target concept is not an assignment row' });
      return;
    }

    const now = new Date().toISOString();
    const source = mode === 'use_now_slot' ? 'history_use_now_slot' : 'history_manual';

    // Delegate link + stats propagation + best-effort candidate status to service.
    const result = await confirmPublishedConcept({
      supabase,
      customerId: historyCustomerId,
      historyConceptId,
      targetCustomerConceptId: resolvedLinkedConceptId,
      actorId: req.user!.id,
      source,
      now,
    });

    if (result.error) {
      res.status(500).json({ error: result.error });
      return;
    }

    if (result.warnings.length > 0) {
      logger.warn({ warnings: result.warnings, historyConceptId }, 'studio-v2 history reconciliation: non-fatal warnings');
    }

    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'studio-v2 history reconciliation error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// DELETE /api/studio-v2/history/reconciliation
// Clears the reconciliation link on an imported_history row, returning it to
// pure-TikTok status and removing the stats overlay from the linked assignment card.
router.delete('/history/reconciliation', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const historyConceptId = typeof body.history_concept_id === 'string' ? body.history_concept_id.trim() : '';

    if (!historyConceptId) {
      res.status(400).json({ error: 'history_concept_id is required' });
      return;
    }

    // Lightweight pre-flight: verify the row exists, belongs to an accessible
    // customer, and is an imported_history row (not an assignment).
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
    const undoCustomerId = (historyRow as { customer_profile_id: string }).customer_profile_id;
    if (!(await ensureCustomerAccess(req, res, undoCustomerId))) return;
    if ((historyRow as Record<string, unknown>).concept_id) {
      res.status(409).json({ error: 'Only imported TikTok history rows can have reconciliation cleared' });
      return;
    }

    // Delegate link-clear + stats-clear + candidate-reset to service.
    const result = await undoConfirmedConcept({
      supabase,
      historyConceptId,
      customerId: undoCustomerId,
      now: new Date().toISOString(),
    });

    if (result.error) {
      res.status(500).json({ error: result.error });
      return;
    }

    if (result.warnings.length > 0) {
      logger.warn({ warnings: result.warnings, historyConceptId }, 'studio-v2 history reconciliation DELETE: non-fatal warnings');
    }

    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'studio-v2 history reconciliation DELETE error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation Candidates
// Endpoints for the feed_reconciliation_candidates audit-trail table.
// Flow: generate → list → accept | reject
// ─────────────────────────────────────────────────────────────────────────────


// POST /api/studio-v2/customers/:customerId/reconciliation-candidates/generate
// Scores all unreconciled history rows against eligible target rows and upserts
// suggested candidates into feed_reconciliation_candidates. Skips any pair
// already decided (accepted / rejected / auto_accepted).
router.post('/customers/:customerId/reconciliation-candidates/generate', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params as { customerId: string };
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const supabase = createSupabaseAdmin();
    const result = await generateReconciliationCandidates(supabase, customerId);
    res.json(result);
  } catch (err) {
    logger.error(err, 'reconciliation-candidates generate error');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internt serverfel' });
  }
});

// GET /api/studio-v2/customers/:customerId/reconciliation-candidates
// Lists candidates with enriched history + target metadata.
// Optional query param: ?status=suggested|accepted|rejected|auto_accepted
router.get('/customers/:customerId/reconciliation-candidates', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params as { customerId: string };
    if (!(await ensureCustomerAccess(req, res, customerId))) return;
    const supabase = createSupabaseAdmin();

    const VALID_STATUSES = new Set(['suggested', 'accepted', 'rejected', 'auto_accepted']);
    const statusFilter = typeof req.query['status'] === 'string' && VALID_STATUSES.has(req.query['status'] as string)
      ? (req.query['status'] as string)
      : null;

    let query = supabase
      .from('feed_reconciliation_candidates')
      .select('*')
      .eq('customer_id', customerId)
      .order('score', { ascending: false })
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: candidates, error: candErr } = await query;
    if (candErr) { res.status(500).json({ error: candErr.message }); return; }

    const rows = (candidates ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) { res.json({ candidates: [] }); return; }

    // Enrich with history and target metadata in one round-trip each
    const historyIds = [...new Set(rows.map((r) => r['history_concept_id'] as string))];
    const targetIds = [...new Set(rows.map((r) => r['target_customer_concept_id'] as string))];

    const [{ data: historyMeta }, { data: targetMeta }] = await Promise.all([
      supabase
        .from('customer_concepts')
        .select('id, published_at, tiktok_url, tiktok_thumbnail_url, feed_order')
        .in('id', historyIds),
      supabase
        .from('customer_concepts')
        .select('id, feed_order, planned_publish_at, status, concepts ( id, backend_data, overrides )')
        .in('id', targetIds),
    ]);

    const historyById = new Map(
      ((historyMeta ?? []) as Array<Record<string, unknown>>).map((r) => [r['id'] as string, r]),
    );
    const targetById = new Map(
      ((targetMeta ?? []) as Array<Record<string, unknown>>).map((r) => [r['id'] as string, r]),
    );

    const enriched = rows.map((c) => ({
      ...c,
      history: historyById.get(c['history_concept_id'] as string) ?? null,
      target: targetById.get(c['target_customer_concept_id'] as string) ?? null,
    }));

    res.json({ candidates: enriched });
  } catch (err) {
    logger.error(err, 'reconciliation-candidates list error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/studio-v2/reconciliation-candidates/:candidateId/accept
// Applies the reconciliation link, marks the candidate accepted, and rejects
// all other suggested candidates competing for the same history row.
router.post('/reconciliation-candidates/:candidateId/accept', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { candidateId } = req.params as { candidateId: string };
    const supabase = createSupabaseAdmin();

    const { data: candidate, error: candErr } = await supabase
      .from('feed_reconciliation_candidates')
      .select('*')
      .eq('id', candidateId)
      .maybeSingle();

    if (candErr) { res.status(500).json({ error: candErr.message }); return; }
    if (!candidate) { res.status(404).json({ error: 'Candidate not found' }); return; }

    const c = candidate as Record<string, unknown>;
    if (!(await ensureCustomerAccess(req, res, c['customer_id'] as string))) return;

    if (c['status'] === 'accepted' || c['status'] === 'auto_accepted') {
      res.status(409).json({ error: 'Candidate is already accepted' });
      return;
    }

    const now = new Date().toISOString();
    const actorId = req.user!.id;

    // Delegate link + stats propagation + candidate status to service.
    // The accept endpoint treats candidate-status failure as FATAL (unlike manual
    // reconciliation which treats it as best-effort). Check candidateUpdated and
    // surface a 500 if it was not updated so the UI never shows a false success.
    const result = await confirmPublishedConcept({
      supabase,
      customerId: c['customer_id'] as string,
      historyConceptId: c['history_concept_id'] as string,
      targetCustomerConceptId: c['target_customer_concept_id'] as string,
      actorId,
      source: 'candidate_accept',
      now,
    });

    if (result.error) {
      res.status(500).json({ error: result.error });
      return;
    }

    if (!result.candidateUpdated) {
      // The link was written but candidate status could not be updated.
      // Per guardrail: candidate_accept must not silently succeed in this case.
      logger.error(
        { candidateId, actorId, warnings: result.warnings },
        'reconciliation-candidates: candidate status sync failed after link',
      );
      res.status(500).json({
        error: 'Länken skapades men kandidatstatus kunde inte uppdateras',
        candidate_sync_error: result.warnings.find((w) => w.startsWith('candidate-status:')) ?? 'unknown',
      });
      return;
    }

    if (result.warnings.length > 0) {
      logger.warn({ candidateId, warnings: result.warnings }, 'reconciliation-candidates: non-fatal warnings after accept');
    }

    logger.info({ candidateId, actorId }, 'reconciliation-candidates: accepted');
    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'reconciliation-candidates accept error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/studio-v2/reconciliation-candidates/:candidateId/reject
// Marks a suggested candidate as rejected. Accepted candidates cannot be rejected
// through this endpoint — use DELETE /history/reconciliation to undo a link.
router.post('/reconciliation-candidates/:candidateId/reject', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { candidateId } = req.params as { candidateId: string };
    const supabase = createSupabaseAdmin();

    const { data: candidate, error: candErr } = await supabase
      .from('feed_reconciliation_candidates')
      .select('id, customer_id, status')
      .eq('id', candidateId)
      .maybeSingle();

    if (candErr) { res.status(500).json({ error: candErr.message }); return; }
    if (!candidate) { res.status(404).json({ error: 'Candidate not found' }); return; }

    const c = candidate as Record<string, unknown>;
    if (!(await ensureCustomerAccess(req, res, c['customer_id'] as string))) return;

    if (c['status'] === 'rejected') {
      res.status(409).json({ error: 'Candidate is already rejected' });
      return;
    }
    if (c['status'] === 'accepted' || c['status'] === 'auto_accepted') {
      res.status(409).json({ error: 'Cannot reject an accepted candidate — undo the link via DELETE /history/reconciliation instead' });
      return;
    }

    const now = new Date().toISOString();
    const { error: rejectErr } = await supabase
      .from('feed_reconciliation_candidates')
      .update({ status: 'rejected', decided_at: now, decided_by: req.user!.id })
      .eq('id', candidateId);

    if (rejectErr) { res.status(500).json({ error: rejectErr.message }); return; }

    logger.info({ candidateId }, 'reconciliation-candidates: rejected');
    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'reconciliation-candidates reject error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Concepts (library-level)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      'planned_publish_at', 'tags',
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Dashboard
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
