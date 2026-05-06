import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin, createSupabaseUserClient } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { buildGamePlanInput, generateGamePlanDraft, stripGamePlanHtml } from '../../lib/game-plan-generate.js';
import { syncCustomerHistory } from '../../lib/studio/tiktok-sync.js';

const router = Router();
const ADMIN_OR_CM = requireRole(['admin', 'content_manager']);
const ADMIN_ONLY = requireRole(['admin']);

type OwnerLite = {
  name: string;
  avatarUrl: string | null;
  profileId: string | null;
};

type OwnerMember = {
  id: string;
  profile_id: string | null;
  name: string | null;
  email?: string | null;
  avatar_url?: string | null;
  color?: string | null;
};

const NEXT_STATUS: Record<string, string | null> = {
  draft: 'sent',
  sent: 'opened',
  opened: 'quoted',
  responded: 'quoted',
  quoted: 'won',
  won: null,
  lost: null,
  expired: null,
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeHandle(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) return null;
  if (raw.startsWith('@')) return raw.slice(1).split('/')[0] || null;
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (url.hostname.includes('tiktok.com')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const handlePart = parts.find((part) => part.startsWith('@'));
      if (handlePart) return handlePart.slice(1) || null;
      return parts[0]?.replace('@', '') || null;
    }
  } catch {
    // Treat non-URL input as a plain handle below.
  }
  return raw.replace('@', '').split('/')[0] || null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainTextToHtml(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function deriveOwnerName(email: string | null, fallbackId: string): string {
  if (!email) return `Admin ${fallbackId.slice(0, 8)}`;
  return email.split('@')[0] || email;
}

async function resolveOwnerMemberForWrite(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  ownerId: unknown,
): Promise<OwnerMember | null> {
  const id = readString(ownerId);
  if (!id) return null;

  const { data: existing, error: existingError } = await supabase
    .from('team_members')
    .select('id, profile_id, name, email, avatar_url, color')
    .eq('id', id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing as OwnerMember;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, role, is_admin, avatar_url')
    .eq('id', id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile || !(profile.is_admin || profile.role === 'admin')) return null;

  const email = readString(profile.email);
  const { data: created, error: createError } = await (supabase as any)
    .from('team_members')
    .insert({
      profile_id: profile.id,
      name: deriveOwnerName(email, profile.id),
      email: email ?? `${profile.id}@admin.local`,
      role: 'admin',
      is_active: true,
      avatar_url: readString(profile.avatar_url),
      color: '#4f46e5',
      commission_rate: 0,
    })
    .select('id, profile_id, name, email, avatar_url, color')
    .single();

  if (createError) throw createError;
  return created as OwnerMember;
}

type DemoHistorySyncResult =
  | { status: 'skipped'; reason: 'missing_handle' | 'missing_api_key' }
  | {
      status: 'ok' | 'error';
      fetched: number;
      imported: number;
      statsUpdated: number;
      callsUsed: number;
      pages: number;
      error?: string;
    };

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

async function runDemoHistorySync(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  customerId: string,
  tiktokHandle: unknown,
): Promise<DemoHistorySyncResult> {
  const handle = normalizeHandle(tiktokHandle);
  if (!handle) return { status: 'skipped', reason: 'missing_handle' };

  const rapidApiKey = process.env['RAPIDAPI_KEY'];
  if (!rapidApiKey) return { status: 'skipped', reason: 'missing_api_key' };

  const pages = envInt('DEMO_SYNC_PAGES', envInt('SYNC_FULL_HISTORY_PAGES', 5, 1, 10), 1, 10);
  const pageSize = envInt('DEMO_SYNC_PAGE_SIZE', 50, 5, 50);
  const result = await syncCustomerHistory(supabase, customerId, handle, rapidApiKey, {
    mode: 'manual',
    pages,
    pageSize,
  });

  return {
    status: result.error && result.error !== 'already_locked' ? 'error' : 'ok',
    fetched: result.fetched,
    imported: result.imported,
    statsUpdated: result.statsUpdated,
    callsUsed: result.callsUsed,
    pages: result.pages,
    ...(result.error ? { error: result.error } : {}),
  };
}

function createDemoWriteClient(req: { user?: { is_admin?: boolean }; authToken?: string }) {
  if (req.user?.is_admin && req.authToken) {
    return createSupabaseUserClient(req.authToken) as ReturnType<typeof createSupabaseAdmin>;
  }
  return createSupabaseAdmin();
}

async function updateDemoReturning(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  id: string,
  updates: Record<string, any>,
) {
  const { data, error } = await (supabase as any)
    .from('demos')
    .update(updates)
    .eq('id', id)
    .select()
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) ? (data[0] as Record<string, any> | undefined) ?? null : null;
}

function mapRow(
  row: Record<string, any>,
  ownerById: Map<string, OwnerLite>,
  conceptCountByCustomerId: Map<string, number> = new Map(),
) {
  const statusChangedAt =
    row['status_changed_at'] ?? row['updated_at'] ?? row['created_at'] ?? new Date().toISOString();
  const owner = row['owner_admin_id'] ? ownerById.get(row['owner_admin_id']) : null;
  const convertedCustomerId = row['converted_customer_id'] ?? null;
  const studioConceptCount = convertedCustomerId
    ? conceptCountByCustomerId.get(convertedCustomerId) ?? 0
    : 0;
  return {
    id: row['id'],
    companyName: row['company_name'] ?? '',
    contactName: row['contact_name'] ?? null,
    contactEmail: row['contact_email'] ?? null,
    tiktokHandle: row['tiktok_handle'] ?? null,
    proposedConceptsPerWeek: row['proposed_concepts_per_week'] ?? null,
    proposedPriceOre: row['proposed_price_ore'] ?? null,
    status: row['status'] ?? 'draft',
    statusChangedAt,
    ownerName: owner?.name ?? null,
    ownerAvatarUrl: owner?.avatarUrl ?? null,
    ownerAdminId: row['owner_admin_id'] ?? null,
    lostReason: row['lost_reason'] ?? null,
    nextStatus: NEXT_STATUS[row['status'] ?? 'draft'] ?? null,
    convertedCustomerId,
    shareToken: row['share_token'] ?? null,
    hasFeedplan: studioConceptCount > 0,
    studioConceptCount,
    hasGamePlan: Boolean(readString(row['game_plan']) || readString(row['game_plan_html'])),
    createdAt: row['created_at'] ?? new Date().toISOString(),
  };
}

function buildBoard(
  rows: any[],
  ownerById: Map<string, OwnerLite>,
  conceptCountByCustomerId: Map<string, number> = new Map(),
) {
  const now = Date.now();
  const ms30 = 30 * 24 * 60 * 60 * 1000;
  const ms60 = 60 * 24 * 60 * 60 * 1000;

  const sentLast30 = rows.filter((r) => {
    const d = r['status_changed_at'] ?? r['created_at'];
    return r['status'] === 'sent' && d && now - new Date(d).getTime() <= ms30;
  }).length;
  const sentPrev30 = rows.filter((r) => {
    const d = r['status_changed_at'] ?? r['created_at'];
    const ms = d ? now - new Date(d).getTime() : Infinity;
    return r['status'] === 'sent' && ms > ms30 && ms <= ms60;
  }).length;
  const openedLast30 = rows.filter((r) => {
    const d = r['status_changed_at'] ?? r['created_at'];
    return r['status'] === 'opened' && d && now - new Date(d).getTime() <= ms30;
  }).length;
  const openedPrev30 = rows.filter((r) => {
    const d = r['status_changed_at'] ?? r['created_at'];
    const ms = d ? now - new Date(d).getTime() : Infinity;
    return r['status'] === 'opened' && ms > ms30 && ms <= ms60;
  }).length;
  const convertedLast30 = rows.filter((r) => {
    const d = r['status_changed_at'] ?? r['created_at'];
    return r['status'] === 'won' && d && now - new Date(d).getTime() <= ms30;
  }).length;
  const convertedPrev30 = rows.filter((r) => {
    const d = r['status_changed_at'] ?? r['created_at'];
    const ms = d ? now - new Date(d).getTime() : Infinity;
    return r['status'] === 'won' && ms > ms30 && ms <= ms60;
  }).length;

  const closedStatuses = new Set(['won', 'lost', 'expired']);
  const activeRows = rows.filter((r) => !closedStatuses.has(r['status']));

  const columns = {
    draft: activeRows.filter((r) => r['status'] === 'draft').map((r) => mapRow(r, ownerById, conceptCountByCustomerId)),
    sent: activeRows.filter((r) => r['status'] === 'sent').map((r) => mapRow(r, ownerById, conceptCountByCustomerId)),
    opened: activeRows.filter((r) => r['status'] === 'opened').map((r) => mapRow(r, ownerById, conceptCountByCustomerId)),
    responded: activeRows.filter((r) => r['status'] === 'responded' || r['status'] === 'quoted').map((r) => mapRow(r, ownerById, conceptCountByCustomerId)),
    closed: rows.filter((r) => closedStatuses.has(r['status'])).map((r) => mapRow(r, ownerById, conceptCountByCustomerId)),
  };

  return {
    sentLast30,
    sentPrev30,
    openedLast30,
    openedPrev30,
    convertedLast30,
    convertedPrev30,
    totalOnBoard: activeRows.length,
    columns,
    schemaWarnings: [],
  };
}

// GET /api/admin/demos
router.get('/', requireAuth, ADMIN_OR_CM, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const days = Math.min(Math.max(Number(req.query['days'] ?? 30), 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabase
      .from('demos')
      .select(
        'id, company_name, contact_name, contact_email, tiktok_handle, proposed_concepts_per_week, proposed_price_ore, status, status_changed_at, owner_admin_id, lost_reason, converted_customer_id, share_token, game_plan, game_plan_html, created_at',
      )
      .or(`status.not.in.(won,lost,expired),created_at.gte.${since}`)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      const msg = String(error.message ?? '').toLowerCase();
      if (msg.includes('does not exist')) {
        res.json({ sentLast30: 0, sentPrev30: 0, openedLast30: 0, openedPrev30: 0, convertedLast30: 0, convertedPrev30: 0, totalOnBoard: 0, columns: { draft: [], sent: [], opened: [], responded: [], closed: [] }, schemaWarnings: ['Tabellen demos saknas'] });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    const ownerIds = Array.from(new Set((rows ?? []).map((r) => r['owner_admin_id']).filter(Boolean))) as string[];
    const ownerById = new Map<string, OwnerLite>();

    if (ownerIds.length > 0) {
      const { data: owners } = await supabase
        .from('team_members')
        .select('id, profile_id, name, avatar_url')
        .in('id', ownerIds);
      for (const o of owners ?? []) {
        ownerById.set(o['id'], {
          name: o['name'] ?? 'Okänd',
          avatarUrl: (o['avatar_url'] as string | null) ?? null,
          profileId: (o['profile_id'] as string | null) ?? null,
        });
      }
    }

    const convertedCustomerIds = Array.from(
      new Set((rows ?? []).map((r) => r['converted_customer_id']).filter(Boolean)),
    ) as string[];
    const conceptCountByCustomerId = new Map<string, number>();

    if (convertedCustomerIds.length > 0) {
      const { data: conceptRows } = await supabase
        .from('customer_concepts')
        .select('customer_profile_id')
        .in('customer_profile_id', convertedCustomerIds)
        .not('feed_order', 'is', null)
        .neq('status', 'archived');

      for (const row of conceptRows ?? []) {
        const customerId = row['customer_profile_id'] as string | null;
        if (!customerId) continue;
        conceptCountByCustomerId.set(customerId, (conceptCountByCustomerId.get(customerId) ?? 0) + 1);
      }
    }

    res.json(buildBoard(rows ?? [], ownerById, conceptCountByCustomerId));
  } catch (err) {
    logger.error(err, 'demos board error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/demos
router.post('/', requireAuth, ADMIN_OR_CM, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body ?? {};
    const companyName = readString(body.company_name);

    if (!companyName) {
      res.status(400).json({ error: 'company_name krävs' });
      return;
    }

    const ownerMember = await resolveOwnerMemberForWrite(supabase, body.owner_admin_id);

    const { data, error } = await supabase
      .from('demos')
      .insert({
        company_name: companyName,
        contact_name: readString(body.contact_name),
        contact_email: readString(body.contact_email),
        tiktok_handle: normalizeHandle(body.tiktok_handle),
        proposed_concepts_per_week: readNumber(body.proposed_concepts_per_week),
        proposed_price_ore: readNumber(body.proposed_price_ore),
        owner_admin_id: ownerMember?.id ?? null,
        game_plan: readString(body.game_plan),
        game_plan_html: readString(body.game_plan_html),
        game_plan_generation_context:
          body.game_plan_generation_context && typeof body.game_plan_generation_context === 'object'
            ? body.game_plan_generation_context
            : {},
        game_plan_generated_at: readString(body.game_plan_html) ? new Date().toISOString() : null,
        game_plan_source: readString(body.game_plan_source),
        preview_notes: readString(body.preview_notes),
        preview_settings:
          body.preview_settings && typeof body.preview_settings === 'object'
            ? body.preview_settings
            : {},
        preview_metrics:
          body.preview_metrics && typeof body.preview_metrics === 'object'
            ? body.preview_metrics
            : {},
        status: readString(body.status) ?? 'draft',
        lost_reason: readString(body.lost_reason),
        share_token: randomBytes(19).toString('hex'),
      } as any)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    let studio: { customerId: string; created: boolean } | null = null;
    let sync: DemoHistorySyncResult | null = null;
    if (body.prepare_studio === true) {
      const prepared = await ensureStudioCustomerForDemo(supabase, (data as any).id, {
        syncHistory: body.sync_tiktok_history === true,
      });
      if (!prepared.success) {
        res.status(prepared.status).json({ error: prepared.error });
        return;
      }
      studio = { customerId: prepared.customerId, created: prepared.created };
      sync = prepared.sync ?? null;
    }

    res.status(201).json({ demo: mapRow(data as any, new Map()), studio, sync });
  } catch (err) {
    logger.error(err, 'demos create error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/demos/game-plan/generate
router.post('/game-plan/generate', requireAuth, ADMIN_OR_CM, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyName = readString(body.company_name) ?? readString(body.customer_name);
    if (!companyName) {
      res.status(400).json({ error: 'company_name krävs' });
      return;
    }

    const input = buildGamePlanInput({
      ...body,
      customer_name: companyName,
      platform: readString(body.platform) ?? 'TikTok',
      tiktok_handle: normalizeHandle(body.tiktok_handle),
      proposed_concepts_per_week:
        typeof body.proposed_concepts_per_week === 'number'
          ? String(body.proposed_concepts_per_week)
          : readString(body.proposed_concepts_per_week),
    });

    const result = await generateGamePlanDraft({ input, mode: 'demo' });
    res.json(result);
  } catch (err) {
    logger.error(err, 'demo game-plan generate error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

async function seedGamePlanFromDemo(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  customerId: string,
  demo: Record<string, any>,
) {
  const gamePlan = readString(demo['game_plan']);
  const gamePlanHtml = readString(demo['game_plan_html']);
  if (!gamePlan && !gamePlanHtml) return;

  const { error } = await (supabase as any)
    .from('customer_game_plans')
    .upsert(
      {
        customer_id: customerId,
        html: gamePlanHtml ?? plainTextToHtml(gamePlan ?? ''),
        plain_text: gamePlan ?? stripGamePlanHtml(gamePlanHtml ?? ''),
        editor_version: 1,
      },
      { onConflict: 'customer_id' },
    );

  if (error) {
    logger.warn({ err: error, customerId }, 'demo prepare-studio game plan seed failed');
  }
}

async function syncConvertedCustomerFromDemoPatch(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  demo: Record<string, any>,
  changed: Record<string, any>,
) {
  const customerId = readString(demo['converted_customer_id']);
  if (!customerId) return;

  const patch: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(changed, 'company_name')) {
    patch.business_name = readString(demo['company_name']) ?? '';
  }
  if (Object.prototype.hasOwnProperty.call(changed, 'contact_name')) {
    patch.customer_contact_name = readString(demo['contact_name']);
  }
  if (Object.prototype.hasOwnProperty.call(changed, 'contact_email')) {
    patch.contact_email = readString(demo['contact_email']);
  }
  if (Object.prototype.hasOwnProperty.call(changed, 'tiktok_handle')) {
    patch.tiktok_handle = normalizeHandle(demo['tiktok_handle']);
  }
  if (Object.prototype.hasOwnProperty.call(changed, 'proposed_concepts_per_week')) {
    const cpw = Math.min(Math.max(readNumber(demo['proposed_concepts_per_week']) ?? 2, 0), 7);
    patch.expected_concepts_per_week = cpw;
    patch.concepts_per_week = cpw;
  }
  if (Object.prototype.hasOwnProperty.call(changed, 'proposed_price_ore')) {
    const priceOre = readNumber(demo['proposed_price_ore']);
    patch.monthly_price = priceOre ? priceOre / 100 : 0;
    patch.pricing_status = priceOre ? 'fixed' : 'unknown';
  }
  if (Object.prototype.hasOwnProperty.call(changed, 'owner_admin_id')) {
    const ownerId = readString(demo['owner_admin_id']);
    if (ownerId) {
      const { data: owner } = await supabase
        .from('team_members')
        .select('profile_id, name, avatar_url, color')
        .eq('id', ownerId)
        .maybeSingle();
      patch.account_manager = owner?.name ?? null;
      patch.account_manager_profile_id = owner?.profile_id ?? null;
      patch.cm_avatar_url = owner?.avatar_url ?? null;
      patch.cm_initial_color = owner?.color ?? null;
    } else {
      patch.account_manager = null;
      patch.account_manager_profile_id = null;
      patch.cm_avatar_url = null;
      patch.cm_initial_color = null;
    }
  }

  if (Object.keys(patch).length === 0) return;

  const { error } = await (supabase as any)
    .from('customer_profiles')
    .update(patch)
    .eq('id', customerId);

  if (error) {
    logger.warn({ err: error, customerId }, 'demo patch customer sync failed');
  }
}

async function ensureStudioCustomerForDemo(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  id: string,
  options: { syncHistory?: boolean } = {},
): Promise<
  | {
      success: true;
      demo: Record<string, any>;
      customerId: string;
      created: boolean;
      sync?: DemoHistorySyncResult;
    }
  | { success: false; status: number; error: string }
> {
  const { data: demo, error: demoError } = await supabase
    .from('demos')
    .select('*, converted_customer_id')
    .eq('id', id)
    .single();

  if (demoError || !demo) {
    return { success: false, status: 404, error: 'Demot hittades inte.' };
  }

  const demoRow = demo as Record<string, any>;
  if (demoRow.converted_customer_id) {
    await seedGamePlanFromDemo(supabase, demoRow.converted_customer_id, demoRow);
    const sync = options.syncHistory
      ? await runDemoHistorySync(supabase, demoRow.converted_customer_id, demoRow.tiktok_handle)
      : undefined;
    return {
      success: true,
      demo: demoRow,
      customerId: demoRow.converted_customer_id,
      created: false,
      ...(sync ? { sync } : {}),
    };
  }

  let ownerMember: Record<string, any> | null = null;
  const ownerAdminId = readString(demoRow.owner_admin_id);
  if (ownerAdminId) {
    const { data: member } = await supabase
      .from('team_members')
      .select('id, profile_id, name, avatar_url, color')
      .eq('id', ownerAdminId)
      .maybeSingle();
    ownerMember = (member as Record<string, any> | null) ?? null;
  }

  const cpw = Math.min(Math.max(demoRow.proposed_concepts_per_week ?? 2, 0), 7);
  const { data: newProfile, error: profileError } = await supabase
    .from('customer_profiles')
    .insert({
      business_name: demoRow.company_name,
      contact_email: demoRow.contact_email || 'demo@letrend.se',
      customer_contact_name: demoRow.contact_name ?? null,
      tiktok_handle: demoRow.tiktok_handle ?? null,
      tiktok_profile_pic_url: demoRow.tiktok_profile_pic_url ?? null,
      status: 'prospect',
      lifecycle_state: 'draft',
      onboarding_state: 'cm_ready',
      expected_concepts_per_week: cpw,
      concepts_per_week: cpw,
      monthly_price: demoRow.proposed_price_ore ? demoRow.proposed_price_ore / 100 : 0,
      account_manager: ownerMember?.name ?? null,
      account_manager_profile_id: ownerMember?.profile_id ?? null,
      cm_avatar_url: ownerMember?.avatar_url ?? null,
      cm_initial_color: ownerMember?.color ?? null,
      first_invoice_behavior: 'full',
      pricing_status: demoRow.proposed_price_ore ? 'fixed' : 'unknown',
      from_demo_id: id,
    } as any)
    .select('id')
    .single();

  if (profileError || !newProfile) {
    const msg = profileError?.message ?? 'Kunde inte skapa skugg-profil.';
    logger.error(profileError, 'prepare-studio create profile error');
    return { success: false, status: 500, error: msg };
  }

  await supabase
    .from('demos')
    .update({ converted_customer_id: newProfile.id } as any)
    .eq('id', id);

  await seedGamePlanFromDemo(supabase, newProfile.id, demoRow);

  const sync = options.syncHistory
    ? await runDemoHistorySync(supabase, newProfile.id, demoRow.tiktok_handle)
    : undefined;

  return {
    success: true,
    demo: demoRow,
    customerId: newProfile.id,
    created: true,
    ...(sync ? { sync } : {}),
  };
}
// POST /api/admin/demos/:id/prepare-studio
router.post('/:id/prepare-studio', requireAuth, ADMIN_OR_CM, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: 'Demo-id saknas' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await ensureStudioCustomerForDemo(supabase, id, {
      syncHistory: body.sync_tiktok_history === true,
    });

    if (!result.success) {
      res.status(result.status).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      customerId: result.customerId,
      created: result.created,
      sync: result.sync ?? null,
    });
  } catch (err) {
    logger.error(err, 'demos prepare-studio error');
    res.status(500).json({ success: false, error: 'Internt serverfel' });
  }
});

// POST /api/admin/demos/:id/convert
router.post('/:id/convert', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body ?? {};
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Demo-id saknas' });
      return;
    }
    const result = await ensureStudioCustomerForDemo(supabase, id);

    if (!result.success) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const billingDayRaw = readNumber(body.billing_day_of_month);
    const billingDay = Math.max(1, Math.min(28, billingDayRaw ?? 25));
    const contractStartDate = readString(body.contract_start_date) ?? new Date().toISOString().slice(0, 10);
    const inviteRequested = body.send_invite === true;

    const { data: customer, error: customerError } = await supabase
      .from('customer_profiles')
      .update({
        status: inviteRequested ? 'invited' : 'active',
        lifecycle_state: inviteRequested ? 'invited' : 'active',
        onboarding_state: inviteRequested ? 'invited' : 'live',
        billing_day_of_month: billingDay,
        contract_start_date: contractStartDate,
        invited_at: inviteRequested ? new Date().toISOString() : null,
      } as any)
      .eq('id', result.customerId)
      .select('id, business_name, contact_email')
      .single();

    if (customerError || !customer) {
      res.status(500).json({ error: customerError?.message ?? 'Kunde inte uppdatera kundprofilen.' });
      return;
    }

    const { data: updatedDemo, error: demoUpdateError } = await supabase
      .from('demos')
      .update({
        status: 'won',
        status_changed_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
        converted_customer_id: result.customerId,
      } as any)
      .eq('id', id)
      .select('id, status')
      .single();

    if (demoUpdateError) {
      res.status(500).json({ error: demoUpdateError.message });
      return;
    }

    res.json({
      customer,
      demo: updatedDemo,
      invite_sent: false,
      warning: inviteRequested ? 'Kunden markerades som inbjuden, men e-postinbjudan skickas manuellt från kundprofilen.' : null,
      was_idempotent_replay: Boolean(result.demo.converted_customer_id),
    });
  } catch (err) {
    logger.error(err, 'demos convert error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});
// PATCH /api/admin/demos/:id
router.patch('/:id', requireAuth, ADMIN_OR_CM, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = req.body ?? {};
    if (!id) {
      res.status(400).json({ error: 'Demo-id saknas' });
      return;
    }

    const updates: Record<string, any> = {};
    if (body.status !== undefined) {
      const now = new Date().toISOString();
      updates['status'] = body.status;
      updates['status_changed_at'] = now;
      if (body.status === 'sent') updates['sent_at'] = now;
      if (body.status === 'opened') updates['opened_at'] = now;
      if (body.status === 'responded') updates['responded_at'] = now;
      if (body.status === 'won' || body.status === 'lost' || body.status === 'expired') {
        updates['resolved_at'] = now;
      }
    }
    if (body.lost_reason !== undefined) updates['lost_reason'] = readString(body.lost_reason);
    if (body.company_name !== undefined) updates['company_name'] = readString(body.company_name);
    if (body.contact_name !== undefined) updates['contact_name'] = readString(body.contact_name);
    if (body.contact_email !== undefined) updates['contact_email'] = readString(body.contact_email);
    if (body.tiktok_handle !== undefined) updates['tiktok_handle'] = normalizeHandle(body.tiktok_handle);
    if (body.proposed_concepts_per_week !== undefined) {
      updates['proposed_concepts_per_week'] = readNumber(body.proposed_concepts_per_week);
    }
    if (body.proposed_price_ore !== undefined) updates['proposed_price_ore'] = readNumber(body.proposed_price_ore);
    if (body.owner_admin_id !== undefined) {
      const ownerMember = await resolveOwnerMemberForWrite(supabase, body.owner_admin_id);
      updates['owner_admin_id'] = ownerMember?.id ?? null;
    }
    if (body.game_plan !== undefined) updates['game_plan'] = readString(body.game_plan);
    if (body.game_plan_html !== undefined) {
      updates['game_plan_html'] = readString(body.game_plan_html);
      updates['game_plan_generated_at'] = updates['game_plan_html'] ? new Date().toISOString() : null;
    }
    if (body.game_plan_generation_context !== undefined && typeof body.game_plan_generation_context === 'object') {
      updates['game_plan_generation_context'] = body.game_plan_generation_context ?? {};
    }
    if (body.game_plan_source !== undefined) updates['game_plan_source'] = readString(body.game_plan_source);
    if (body.preview_notes !== undefined) updates['preview_notes'] = readString(body.preview_notes);
    if (body.preview_settings !== undefined && typeof body.preview_settings === 'object') {
      updates['preview_settings'] = body.preview_settings ?? {};
    }
    if (body.preview_metrics !== undefined && typeof body.preview_metrics === 'object') {
      updates['preview_metrics'] = body.preview_metrics ?? {};
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'Inga giltiga andringar att spara.' });
      return;
    }

    const data = await updateDemoReturning(supabase, id, updates);
    if (!data) {
      res.status(404).json({ error: 'Demot hittades inte eller kunde inte uppdateras med nuvarande behorighet.' });
      return;
    }

    await syncConvertedCustomerFromDemoPatch(supabase, data as any, updates);

    res.json({ demo: mapRow(data as any, new Map()) });
  } catch (err) {
    logger.error(err, 'demos update error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// DELETE /api/admin/demos/:id
router.delete('/:id', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { id } = req.params;

    const { error } = await supabase.from('demos').delete().eq('id', id);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error(err, 'demos delete error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
