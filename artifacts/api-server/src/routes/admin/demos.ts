import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const ADMIN_OR_CM = requireRole(['admin', 'content_manager']);
const ADMIN_ONLY = requireRole(['admin']);

function mapRow(row: Record<string, any>, ownerNameById: Map<string, string>) {
  const statusChangedAt =
    row['status_changed_at'] ?? row['updated_at'] ?? row['created_at'] ?? new Date().toISOString();
  const hasFeedplan =
    Boolean(row['preliminary_feedplan']) &&
    Array.isArray(row['preliminary_feedplan'])
      ? row['preliminary_feedplan'].length > 0
      : false;
  return {
    id: row['id'],
    companyName: row['company_name'] ?? '',
    contactEmail: row['contact_email'] ?? null,
    tiktokHandle: row['tiktok_handle'] ?? null,
    proposedConceptsPerWeek: row['proposed_concepts_per_week'] ?? null,
    proposedPriceOre: row['proposed_price_ore'] ?? null,
    status: row['status'] ?? 'draft',
    statusChangedAt,
    ownerName: row['owner_admin_id'] ? (ownerNameById.get(row['owner_admin_id']) ?? null) : null,
    lostReason: row['lost_reason'] ?? null,
    nextStatus: null,
    convertedCustomerId: row['converted_customer_id'] ?? null,
    shareToken: row['share_token'] ?? null,
    hasFeedplan,
    createdAt: row['created_at'] ?? new Date().toISOString(),
  };
}

function buildBoard(rows: any[], ownerNameById: Map<string, string>) {
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
    draft: activeRows.filter((r) => r['status'] === 'draft').map((r) => mapRow(r, ownerNameById)),
    sent: activeRows.filter((r) => r['status'] === 'sent').map((r) => mapRow(r, ownerNameById)),
    opened: activeRows.filter((r) => r['status'] === 'opened').map((r) => mapRow(r, ownerNameById)),
    responded: activeRows.filter((r) => r['status'] === 'responded' || r['status'] === 'quoted').map((r) => mapRow(r, ownerNameById)),
    closed: rows.filter((r) => closedStatuses.has(r['status'])).map((r) => mapRow(r, ownerNameById)),
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
        'id, company_name, contact_email, tiktok_handle, proposed_concepts_per_week, proposed_price_ore, status, status_changed_at, owner_admin_id, lost_reason, converted_customer_id, share_token, preliminary_feedplan, created_at, updated_at',
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
    const ownerNameById = new Map<string, string>();

    if (ownerIds.length > 0) {
      const { data: owners } = await supabase
        .from('team_members')
        .select('id, name')
        .in('id', ownerIds);
      for (const o of owners ?? []) {
        ownerNameById.set(o['id'], o['name'] ?? 'Okänd');
      }
    }

    res.json(buildBoard(rows ?? [], ownerNameById));
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

    if (!body.company_name?.trim()) {
      res.status(400).json({ error: 'company_name krävs' });
      return;
    }

    const { data, error } = await supabase
      .from('demos')
      .insert({
        company_name: body.company_name.trim(),
        contact_name: body.contact_name ?? null,
        contact_email: body.contact_email ?? null,
        tiktok_handle: body.tiktok_handle ?? null,
        proposed_concepts_per_week: body.proposed_concepts_per_week ?? null,
        proposed_price_ore: body.proposed_price_ore ?? null,
        status: body.status ?? 'draft',
        lost_reason: body.lost_reason ?? null,
      } as any)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ demo: mapRow(data as any, new Map()) });
  } catch (err) {
    logger.error(err, 'demos create error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/demos/:id/prepare-studio
router.post('/:id/prepare-studio', requireAuth, ADMIN_OR_CM, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { id } = req.params;

    const { data: demo, error: demoError } = await supabase
      .from('demos')
      .select('*, converted_customer_id')
      .eq('id', id)
      .single();

    if (demoError || !demo) {
      res.status(404).json({ success: false, error: 'Demot hittades inte.' });
      return;
    }

    if ((demo as any).converted_customer_id) {
      res.json({ success: true, customerId: (demo as any).converted_customer_id });
      return;
    }

    let accountManagerId = (demo as any).owner_admin_id as string | null;
    if (accountManagerId) {
      const { data: profileExists } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', accountManagerId)
        .maybeSingle();
      if (!profileExists) accountManagerId = null;
    }

    const cpw = Math.min(Math.max((demo as any).proposed_concepts_per_week ?? 2, 0), 7);
    const { data: newProfile, error: profileError } = await supabase
      .from('customer_profiles')
      .insert({
        business_name: (demo as any).company_name,
        contact_email: (demo as any).contact_email || 'demo@letrend.se',
        customer_contact_name: (demo as any).contact_name ?? null,
        tiktok_handle: (demo as any).tiktok_handle ?? null,
        tiktok_profile_pic_url: (demo as any).tiktok_profile_pic_url ?? null,
        status: 'prospect',
        expected_concepts_per_week: cpw,
        concepts_per_week: cpw,
        monthly_price: (demo as any).proposed_price_ore ? (demo as any).proposed_price_ore / 100 : 0,
        account_manager_profile_id: accountManagerId,
        first_invoice_behavior: 'full',
        pricing_status: (demo as any).proposed_price_ore ? 'fixed' : 'unknown',
        from_demo_id: id,
      } as any)
      .select('id')
      .single();

    if (profileError || !newProfile) {
      const msg = profileError?.message ?? 'Kunde inte skapa skugg-profil.';
      logger.error(profileError, 'prepare-studio create profile error');
      res.status(500).json({ success: false, error: msg });
      return;
    }

    await supabase
      .from('demos')
      .update({ converted_customer_id: newProfile.id } as any)
      .eq('id', id);

    res.json({ success: true, customerId: newProfile.id });
  } catch (err) {
    logger.error(err, 'demos prepare-studio error');
    res.status(500).json({ success: false, error: 'Internt serverfel' });
  }
});

// PATCH /api/admin/demos/:id
router.patch('/:id', requireAuth, ADMIN_OR_CM, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { id } = req.params;
    const body = req.body ?? {};

    const updates: Record<string, any> = {};
    if (body.status !== undefined) {
      updates['status'] = body.status;
      updates['status_changed_at'] = new Date().toISOString();
    }
    if (body.lost_reason !== undefined) updates['lost_reason'] = body.lost_reason;

    const { data, error } = await supabase
      .from('demos')
      .update(updates as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

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
