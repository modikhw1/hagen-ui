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

// POST /api/studio-v2/customers/:customerId/game-plan/generate
router.post('/customers/:customerId/game-plan/generate', requireAuth, CM_ONLY, async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!(await ensureCustomerAccess(req, res, customerId))) return;

    const body = req.body as Record<string, unknown>;

    function str(v: unknown): string {
      return typeof v === 'string' ? v.trim() : '';
    }

    function safeReferenceArray(v: unknown): Array<{ url: string; label?: string; note?: string; platform?: string }> {
      if (!Array.isArray(v)) return [];
      return v
        .filter((item) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string')
        .slice(0, 8)
        .map((item) => {
          const r = item as Record<string, unknown>;
          return {
            url: str(r.url),
            label: str(r.label) || undefined,
            note: str(r.note) || undefined,
            platform: str(r.platform) || undefined,
          };
        })
        .filter((r) => r.url);
    }

    function safeImageArray(v: unknown): Array<{ url: string; caption?: string }> {
      if (!Array.isArray(v)) return [];
      return v
        .filter((item) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string')
        .slice(0, 4)
        .map((item) => {
          const i = item as Record<string, unknown>;
          return { url: str(i.url), caption: str(i.caption) || undefined };
        })
        .filter((i) => i.url);
    }

    const input = {
      customer_name: str(body.customer_name),
      niche: str(body.niche),
      platform: str(body.platform),
      character: str(body.character),
      people: str(body.people),
      aesthetic: str(body.aesthetic),
      goals: str(body.goals),
      effort_level: str(body.effort_level),
      unique: str(body.unique),
      audience: str(body.audience),
      references: safeReferenceArray(body.references),
      images: safeImageArray(body.images),
    };

    // ── Inline server-side helpers (ported from frontend lib) ─────────────────

    function escHtml(v: string): string {
      return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function normalizeHrefSrv(v: string): string {
      const t = v.trim();
      if (!t) return '';
      if (/^(https?:\/\/|mailto:)/i.test(t)) return t;
      return `https://${t}`;
    }

    type LinkPlatformSrv = 'tiktok' | 'instagram' | 'youtube' | 'article' | 'external';

    function detectLinkSrv(url: string): LinkPlatformSrv {
      const n = normalizeHrefSrv(url);
      if (!n) return 'external';
      if (/tiktok\.com/i.test(n)) return 'tiktok';
      if (/instagram\.com/i.test(n)) return 'instagram';
      if (/youtube\.com|youtu\.be/i.test(n)) return 'youtube';
      try { const { protocol } = new URL(n); if (protocol === 'http:' || protocol === 'https:') return 'article'; } catch { /* noop */ }
      return 'external';
    }

    function toLinkPlatformSrv(v: string): LinkPlatformSrv {
      const valid: LinkPlatformSrv[] = ['tiktok', 'instagram', 'youtube', 'article', 'external'];
      return valid.includes(v as LinkPlatformSrv) ? (v as LinkPlatformSrv) : 'external';
    }

    function getHostnameSrv(url: string): string {
      try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
    }

    function parseAttrsSrv(s: string): Record<string, string> {
      const out: Record<string, string> = {};
      for (const m of s.matchAll(/([a-zA-Z0-9_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
        const k = m[1]?.toLowerCase(); const v = m[3] ?? m[4] ?? '';
        if (k) out[k] = v;
      }
      return out;
    }

    function stripHtmlSrv(v: string): string {
      return v.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    }

    function renderLinkChipSrv(rawHref: string, rawLabel?: string, rawPlatform?: string): string {
      const href = normalizeHrefSrv(rawHref);
      if (!href) return '';
      const platform = rawPlatform ? toLinkPlatformSrv(rawPlatform) : detectLinkSrv(href);
      const label = (rawLabel || '').trim() || getHostnameSrv(href) || href;
      const icons: Record<LinkPlatformSrv, string> = {
        tiktok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/></svg>',
        instagram: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>',
        youtube: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 00.5 6.19 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.81 3.02 3.02 0 002.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 002.12-2.14A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.81zM9.55 15.5V8.5l6.27 3.5-6.27 3.5z"/></svg>',
        article: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
        external: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
      };
      return `<span data-type="linkChip" style="display:inline;"><a class="gp-link-chip gp-link-chip--${platform}" href="${escHtml(href)}" target="_blank" rel="noopener noreferrer" data-gp-chip="1" data-platform="${platform}" data-label="${escHtml(label)}">${icons[platform]}<span class="gp-link-chip__label">${escHtml(label)}</span></a></span>`;
    }

    function renderImageFigureSrv(rawSrc: string, rawCaption?: string): string {
      const src = normalizeHrefSrv(rawSrc);
      if (!src) return '';
      const caption = (rawCaption || '').trim();
      return `<figure class="gp-image" data-width="100" style="width:100%"><img src="${escHtml(src)}" alt="${escHtml(caption || 'Game Plan image')}" loading="lazy" /><figcaption>${escHtml(caption)}</figcaption></figure>`;
    }

    function renderImageGallerySrv(items: Array<{ src: string; caption?: string }>): string {
      const imgs = items.map((i) => ({ src: normalizeHrefSrv(i.src), caption: (i.caption || '').trim() })).filter((i) => i.src);
      if (!imgs.length) return '';
      const cols = Math.max(1, Math.min(imgs.length, 3));
      return `<div class="gp-image-grid" style="display:grid;grid-template-columns:repeat(${cols}, 1fr);gap:8px;margin-bottom:12px">${imgs.map((i) => `<div data-gp-image-item="1"><img src="${escHtml(i.src)}" alt="${escHtml(i.caption || 'Game Plan image')}" loading="lazy" style="width:100%;aspect-ratio:4 / 3;object-fit:cover;border-radius:6px;display:block"/><div class="gp-image-grid__caption">${escHtml(i.caption)}</div></div>`).join('')}</div>`;
    }

    function sanitizeHtmlSrv(raw: string): string {
      let out = raw.trim().replace(/<!--[\s\S]*?-->/g, '');
      out = out.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
      out = out.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select)\b[^>]*\/?>/gi, '');
      out = out.replace(/<[^>]+>/g, (tag) => {
        if (/^<!/i.test(tag) || /^<\//.test(tag)) return tag;
        const m = tag.match(/^<([a-z0-9-]+)([\s\S]*?)\/?>$/i);
        if (!m) return '';
        const tagName = m[1].toLowerCase(); let attrs = m[2] || '';
        attrs = attrs.replace(/\s+on[a-z-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
        attrs = attrs.replace(/\s+(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi, (_f, name: string, _q, dq, sq, bare) => {
          const v = dq ?? sq ?? bare ?? '';
          const sv = (/^(javascript|data):/i.test(v.trim())) ? '' : normalizeHrefSrv(v);
          return sv ? ` ${name}="${sv}"` : '';
        });
        if (tagName === 'a') {
          attrs = attrs.replace(/\s+(target|rel)\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
          if (/\shref=/i.test(attrs)) attrs += ' target="_blank" rel="noopener noreferrer"';
        }
        if (tagName === 'img') {
          if (!/\ssrc=/i.test(attrs)) return '';
          if (!/\sloading=/i.test(attrs)) attrs += ' loading="lazy"';
        }
        return `<${tagName}${attrs}>`;
      });
      return out.trim();
    }

    function convertAndNormalizeSrv(rawText: string): string {
      const fenceMatch = rawText.match(/```(?:html)?\s*([\s\S]*?)```/i);
      let out = (fenceMatch ? fenceMatch[1].trim() : rawText.trim())
        .replace(/<!doctype[^>]*>/gi, '')
        .replace(/<\/?(html|body)\b[^>]*>/gi, '')
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '');

      out = out.replace(/<image-gallery\b[^>]*>([\s\S]*?)<\/image-gallery>/gi, (_f, inner) => {
        const items: Array<{ src: string; caption?: string }> = [];
        for (const m of inner.matchAll(/<image-item\b([^>]*)\/?>/gi)) {
          const a = parseAttrsSrv(m[1] || ''); if (a.src) items.push({ src: a.src, caption: a.caption });
        }
        return renderImageGallerySrv(items);
      });
      out = out.replace(/<image-figure\b([^>]*)>([\s\S]*?)<\/image-figure>/gi, (_f, attrs, inner) => {
        const a = parseAttrsSrv(attrs || ''); return renderImageFigureSrv(a.src || '', a.caption || stripHtmlSrv(inner));
      });
      out = out.replace(/<image-figure\b([^>]*)\/>/gi, (_f, attrs) => {
        const a = parseAttrsSrv(attrs || ''); return renderImageFigureSrv(a.src || '', a.caption);
      });
      out = out.replace(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi, (_f, inner) => {
        const imgM = inner.match(/<img\b([^>]*)\/?>/i); if (!imgM) return inner;
        const ia = parseAttrsSrv(imgM[1] || ''); if (!ia.src) return inner;
        const capM = inner.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
        const cap = capM ? stripHtmlSrv(capM[1]) : ia.alt || ia.caption || '';
        return renderImageFigureSrv(ia.src, cap);
      });
      out = out.replace(/<link-chip\b([^>]*)>([\s\S]*?)<\/link-chip>/gi, (_f, attrs, inner) => {
        const a = parseAttrsSrv(attrs || ''); return renderLinkChipSrv(a.url || a.href || '', a.label || stripHtmlSrv(inner), a.platform);
      });
      out = out.replace(/<link-chip\b([^>]*)\/>/gi, (_f, attrs) => {
        const a = parseAttrsSrv(attrs || ''); return renderLinkChipSrv(a.url || a.href || '', a.label, a.platform);
      });
      out = out.replace(/<h[1-6]\b[^>]*>/gi, '<h3>').replace(/<\/h[1-6]>/gi, '</h3>');
      out = out.replace(/<img\b([^>]*)\/?>/gi, (_f, attrs) => {
        const a = parseAttrsSrv(attrs || ''); return renderImageFigureSrv(a.src || '', a.alt || a.caption || '');
      });
      out = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_f, attrs, inner) => {
        const a = parseAttrsSrv(attrs || '');
        const href = normalizeHrefSrv(a.href || a.url || '');
        const label = stripHtmlSrv(inner).trim() || a.label || getHostnameSrv(href) || href;
        if (!href) return escHtml(label);
        const platform = detectLinkSrv(href);
        if (platform === 'external' && label && label !== href) {
          return `<a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">${escHtml(label)}</a>`;
        }
        return renderLinkChipSrv(href, label, platform);
      });
      out = out.replace(/<p>\s*(<figure\b[\s\S]*?<\/figure>)\s*<\/p>/gi, '$1').replace(/<p>\s*<\/p>/gi, '');
      return sanitizeHtmlSrv(out).trim();
    }

    function buildFallbackHtmlSrv(): string {
      function bp(v: string, fallback: string): string { const t = v.trim(); return `<p>${escHtml(t || fallback)}</p>`; }
      const refs = input.references
        .map((r) => { const u = normalizeHrefSrv(r.url); if (!u) return null; return { ...r, url: u }; })
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
      const imgs = input.images
        .map((i) => { const u = normalizeHrefSrv(i.url); if (!u) return null; return { ...i, url: u }; })
        .filter((i): i is NonNullable<typeof i> => Boolean(i));

      const refBlock = refs.length > 0
        ? ['<h3>Referenser</h3>', ...refs.map((r, idx) => `<div style="margin-bottom:12px"><div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px">${renderLinkChipSrv(r.url, r.label || `Referens ${idx + 1}`, r.platform)}</div>${r.note ? bp(r.note, '') : ''}</div>`)].join('')
        : '';
      const imgBlock = imgs.length === 1
        ? `<h3>Visuell riktning</h3>${renderImageFigureSrv(imgs[0].url, imgs[0].caption || 'Referensbild')}`
        : imgs.length > 1
          ? `<h3>Visuell riktning</h3>${renderImageGallerySrv(imgs.map((i, idx) => ({ src: i.url, caption: i.caption || `Referens ${idx + 1}` })))}`
          : '';
      const profileParts = [
        input.customer_name.trim() ? `${input.customer_name.trim()} är kunden vi bygger planen för.` : 'Kunden är fokus för planen.',
        input.niche.trim() ? `Nisch/bransch: ${input.niche.trim()}.` : '',
        input.platform.trim() ? `Primär plattform: ${input.platform.trim()}.` : '',
      ].filter(Boolean).join(' ');
      const contextParts = [
        input.character.trim() ? `<h3>Verksamhetens karaktär</h3>${bp(input.character, '')}` : '',
        input.people.trim() ? `<h3>Personalen</h3>${bp(input.people, '')}` : '',
        input.aesthetic.trim() ? `<h3>Lokal och estetik</h3>${bp(input.aesthetic, '')}` : '',
        input.goals.trim() ? `<h3>Mål</h3>${bp(input.goals, '')}` : '',
        input.unique.trim() ? `<h3>Det unika</h3>${bp(input.unique, '')}` : '',
        input.audience.trim() ? `<h3>Målgrupp</h3>${bp(input.audience, '')}` : '',
        input.effort_level.trim() ? `<h3>Ambitionsnivå</h3>${bp(input.effort_level, '')}` : '',
      ].filter(Boolean).join('');
      const raw = [
        '<h3>Kundprofil</h3>',
        bp(profileParts, 'Beskriv kunden, deras nisch och plattform.'),
        contextParts, refBlock, imgBlock,
        '<h3>Nästa steg</h3>',
        '<p>Gå igenom planen, markera vad som känns mest relevant just nu och svara med eventuella justeringar eller fler referenser som vi ska ta vidare.</p>',
      ].join('');
      return sanitizeHtmlSrv(raw);
    }

    // ── Build prompt (exact two-part structure matching buildGamePlanGenerationPrompt) ──

    const normRefs = input.references
      .map((r) => { const u = normalizeHrefSrv(r.url); if (!u) return null; return { url: u, label: r.label || undefined, note: r.note || undefined, platform: r.platform || undefined }; })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    const normImgs = input.images
      .map((i) => { const u = normalizeHrefSrv(i.url); if (!u) return null; return { url: u, caption: i.caption || undefined }; })
      .filter((i): i is NonNullable<typeof i> => Boolean(i));

    const customerContext = {
      kund: input.customer_name.trim() || '(okänd)',
      nisch_och_bransch: input.niche.trim() || null,
      primar_plattform: input.platform.trim() || null,
      verksamhetens_karaktar: input.character.trim() || null,
      personalen: input.people.trim() || null,
      lokal_och_estetik: input.aesthetic.trim() || null,
      vad_kunden_vill_uppna: input.goals.trim() || null,
      ambitionsniva: input.effort_level.trim() || null,
      nagot_som_sticker_ut: input.unique.trim() || null,
      malgrupp: input.audience.trim() || null,
      referenser: normRefs.length > 0 ? normRefs : null,
      bilder: normImgs.length > 0 ? normImgs : null,
    };

    const part1 = [
      'Du är en erfaren svensk content strategist på LeTrend.',
      'Din uppgift är att skriva en Game Plan som HTML för den kund vars kontext ges nedan.',
      '',
      'Röst och ton:',
      '- Skriv som ett varmt, professionellt brev från en content manager som verkligen känner kunden.',
      '- Direkt, konkret och handlingsorienterat. Inga tomma fraser eller marknadsfluff.',
      '- All text på svenska.',
      '',
      'HTML-krav:',
      '- Returnera BARA ett HTML-fragment — ingen markdown, ingen förklaring, inga ```-block.',
      '- Använd endast <h3>-rubriker. Aldrig H1 eller H2.',
      '- Max 6 rubriker totalt.',
      '- Om referenslänkar finns: använd <link-chip url="..." platform="tiktok|instagram|youtube|article|external" label="..."></link-chip>.',
      '- Om en bild finns: använd <image-figure src="..." caption="..."></image-figure>.',
      '- Om flera bilder finns: använd <image-gallery><image-item src="..." caption="..." /></image-gallery>.',
      '',
      'Tolkningsregler:',
      '- Om en referens har en "note" ska du översätta den smaken till tonalitet, pacing och kreativa rekommendationer i planen.',
      '- Om en referens har en "label" ska du behandla den som titel eller arbetsrubrik.',
      '- Avsluta alltid med en sektion som heter "Nästa steg" som uppmuntrar till dialog.',
    ].join('\n');

    const part2 = ['Kundkontext (JSON):', JSON.stringify(customerContext, null, 2).slice(0, 5000)].join('\n');
    const prompt = `${part1}\n\n${part2}`;

    // ── Call Gemini ─────────────────────────────────────────────────────────────

    const apiKey = process.env['REPLIT_AI_INTEGRATIONS_API_KEY'] ?? process.env['GEMINI_API_KEY'];
    const baseUrl = process.env['REPLIT_AI_INTEGRATIONS_GEMINI_BASE_URL'] ?? 'https://generativelanguage.googleapis.com/v1beta';

    if (!apiKey) {
      logger.warn('game-plan/generate: no Gemini API key — using server fallback');
      const html = buildFallbackHtmlSrv();
      res.json({ html, source: 'fallback', reason: 'no_api_key' });
      return;
    }

    let html = '';
    let source = 'ai';
    let errorReason = '';

    try {
      const upstream = await fetch(`${baseUrl}/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 1200 },
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (!upstream.ok) {
        const txt = await upstream.text().catch(() => '');
        throw new Error(`Gemini ${upstream.status}: ${txt.slice(0, 200)}`);
      }

      const data = await upstream.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const rawText = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      html = convertAndNormalizeSrv(rawText);

      if (!html) throw new Error('empty_response');
    } catch (err) {
      logger.warn({ err }, 'game-plan/generate: Gemini call failed — using server fallback');
      source = 'fallback';
      errorReason = err instanceof Error ? err.message : String(err);
      html = buildFallbackHtmlSrv();
    }

    res.json({ html, source, model: source === 'ai' ? 'gemini-1.5-flash' : undefined, reason: errorReason || undefined });
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
