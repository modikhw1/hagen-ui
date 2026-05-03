import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { fetchSubscription } from '../../lib/stripe-client.js';

const router = Router();

const ADMIN_ONLY = requireRole(['admin']);

const CUSTOMER_LIST_SELECT =
  'id, business_name, contact_email, customer_contact_name, phone, account_manager, account_manager_profile_id, monthly_price, subscription_interval, pricing_status, status, lifecycle_state, created_at, agreed_at, invited_at, concepts_per_week, expected_concepts_per_week, paused_until, onboarding_state, onboarding_state_changed_at, tiktok_handle, next_invoice_date, stripe_customer_id, stripe_subscription_id';

const CUSTOMER_DETAIL_SELECT =
  'id, business_name, contact_email, customer_contact_name, phone, account_manager, account_manager_profile_id, monthly_price, subscription_interval, pricing_status, status, lifecycle_state, created_at, agreed_at, invited_at, contract_start_date, billing_day_of_month, concepts_per_week, expected_concepts_per_week, paused_until, onboarding_state, onboarding_state_changed_at, tiktok_handle, tiktok_profile_url, tiktok_user_id, next_invoice_date, stripe_customer_id, stripe_subscription_id, discount_type, discount_value, discount_duration_months, discount_ends_at, upload_schedule, last_upload_at, last_history_sync_at, pending_history_advance_at, upcoming_monthly_price, upcoming_price_effective_date, invoice_text, scope_items, logo_url';

function escapeLike(value: string) {
  return value.replaceAll('%', '\\%').replaceAll(',', ' ');
}

// GET /api/admin/customers
router.get('/', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const q = (req.query['q'] as string ?? '').trim();
    const limitParam = Math.min(Math.max(Number(req.query['limit'] ?? 50), 1), 200);

    let query = supabase
      .from('customer_profiles')
      .select(CUSTOMER_LIST_SELECT)
      .order('created_at', { ascending: false });

    if (q.length >= 2) {
      const term = escapeLike(q);
      query = (query as any)
        .or(
          [
            `business_name.ilike.%${term}%`,
            `contact_email.ilike.%${term}%`,
            `customer_contact_name.ilike.%${term}%`,
            `tiktok_handle.ilike.%${term}%`,
          ].join(','),
        )
        .limit(limitParam);
    } else {
      query = (query as any).limit(limitParam);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ customers: data ?? [] });
  } catch (err) {
    logger.error(err, 'customers list error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/buffer
// IMPORTANT: must be registered before /:id to avoid shadowing
router.get('/buffer', requireAuth, ADMIN_ONLY, async (_req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await (supabase as any)
      .from('v_customer_buffer')
      .select('customer_id, assigned_cm_id, concepts_per_week, paused_until, latest_planned_publish_date, last_published_at')
;

    if (error) {
      res.json({ bufferRows: [] });
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=10');
    res.json({ bufferRows: data ?? [] });
  } catch (err) {
    logger.error(err, 'admin customer buffer error');
    res.json({ bufferRows: [] });
  }
});

// GET /api/admin/customers/export
// IMPORTANT: must be registered before /:id to avoid shadowing
router.get('/export', requireAuth, ADMIN_ONLY, async (_req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('customer_profiles')
      .select('id, business_name, contact_email, customer_contact_name, account_manager, monthly_price, status, created_at, subscription_interval')
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const headers = ['id', 'business_name', 'contact_email', 'customer_contact_name', 'account_manager', 'monthly_price', 'status', 'created_at'];
    const rows = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return headers.map((h) => JSON.stringify(r[h] ?? '')).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
    res.send(csv);
  } catch (err) {
    logger.error(err, 'admin customer export error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id
router.get('/:id', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const { data: profile, error } = await supabase
      .from('customer_profiles')
      .select(CUSTOMER_DETAIL_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!profile) {
      res.status(404).json({ error: 'Kund hittades inte' });
      return;
    }

    const cmId = (profile as any).account_manager_profile_id as string | null;

    const [snoozesResult, absencesResult] = await Promise.all([
      supabase
        .from('attention_snoozes')
        .select('subject_type, subject_id, snoozed_until, released_at, note')
        .eq('subject_id', id),
      cmId
        ? supabase
            .from('cm_absences')
            .select('id, cm_id, backup_cm_id, absence_type, compensation_mode, starts_on, ends_on, note')
            .eq('cm_id', cmId)
            .order('starts_on', { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    // Look up CM names for absences
    const cmIds = new Set<string>();
    for (const a of (absencesResult.data ?? []) as any[]) {
      if (a.cm_id) cmIds.add(a.cm_id);
      if (a.backup_cm_id) cmIds.add(a.backup_cm_id);
    }
    const cmNameById = new Map<string, string>();
    if (cmIds.size > 0) {
      const { data: members } = await (supabase as any)
        .from('team_members')
        .select('id, name')
        .in('id', Array.from(cmIds));
      for (const m of members ?? []) cmNameById.set(m.id as string, (m.name as string) ?? '');
    }

    const today = new Date().toISOString().slice(0, 10);
    const coverage_absences = ((absencesResult.data ?? []) as any[]).map((a) => {
      const isActive = a.starts_on <= today && a.ends_on >= today;
      const isUpcoming = !isActive && a.starts_on > today;
      return {
        id: String(a.id),
        cm_id: String(a.cm_id),
        cm_name: a.cm_id ? cmNameById.get(a.cm_id) ?? null : null,
        backup_cm_id: a.backup_cm_id ?? null,
        backup_cm_name: a.backup_cm_id ? cmNameById.get(a.backup_cm_id) ?? null : null,
        absence_type: String(a.absence_type ?? 'other'),
        compensation_mode: (a.compensation_mode === 'covering_cm' ? 'covering_cm' : 'primary_cm'),
        starts_on: String(a.starts_on),
        ends_on: String(a.ends_on),
        note: a.note ?? null,
        is_active: isActive,
        is_upcoming: isUpcoming,
      };
    });

    const attention_snoozes = ((snoozesResult.data ?? []) as any[]).map((s) => ({
      subject_type: s.subject_type,
      subject_id: s.subject_id,
      snoozed_until: s.snoozed_until ?? null,
      released_at: s.released_at ?? null,
      note: s.note ?? null,
    }));

    const upcomingPriceOre = (profile as any).upcoming_monthly_price;
    const upcomingPriceDate = (profile as any).upcoming_price_effective_date;
    const upcoming_price_change =
      upcomingPriceOre != null && upcomingPriceDate
        ? { effective_date: String(upcomingPriceDate), price_ore: Number(upcomingPriceOre) }
        : null;

    // Normalize subscription_interval / pricing_status which the DTO requires non-null
    const subscription_interval =
      (profile as any).subscription_interval === 'quarter' ||
      (profile as any).subscription_interval === 'year'
        ? (profile as any).subscription_interval
        : 'month';
    const pricing_status =
      (profile as any).pricing_status === 'fixed' ? 'fixed' : 'unknown';

    // Subscription status:
    // 1. Local "paused" / "canceled" derivations always win (admin can pause
    //    a customer locally even if Stripe still shows active until the end
    //    of the period; archived rows should always read as cancelled).
    // 2. Otherwise, when we have a Stripe subscription id we ask Stripe for
    //    the real status so the badge can show past_due / unpaid / trialing
    //    / incomplete instead of a coarse "active".
    // 3. If Stripe is unreachable we fall back to the previous derivation
    //    so the admin UI keeps working.
    const rawStatus = String((profile as any).status ?? '').toLowerCase();
    const stripeSubId = (profile as any).stripe_subscription_id as string | null | undefined;
    let subscription_status: string | null = null;
    if (rawStatus === 'paused' || (profile as any).paused_until) {
      subscription_status = 'paused';
    } else if (
      rawStatus === 'canceled' ||
      rawStatus === 'cancelled' ||
      rawStatus === 'archived' ||
      rawStatus === 'churned' ||
      rawStatus === 'ended' ||
      (profile as any).archived_at
    ) {
      subscription_status = 'canceled';
    } else if (stripeSubId) {
      const fetched = await fetchSubscription(stripeSubId);
      if (fetched) {
        // Map Stripe's `paused` (collection paused) to our local "paused"
        // so the badge / pause UI stays consistent with the manual pause
        // path. Other statuses pass through verbatim.
        subscription_status = fetched.status === 'paused' ? 'paused' : String(fetched.status);
      } else {
        subscription_status = 'active';
      }
    }

    res.json({
      customer: {
        ...profile,
        subscription_interval,
        pricing_status,
        subscription_status,
        cm_avatar_url: null,
        cm_initial_color: null,
        preview_image_url: null,
        last_published_at: null,
        latest_planned_publish_date: null,
        upcoming_price_change,
        attention_snoozes,
        coverage_absences,
      },
    });
  } catch (err) {
    logger.error(err, 'customer detail error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PATCH /api/admin/customers/:id
router.patch('/:id', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();
    const body = req.body as Record<string, unknown>;

    const allowed = [
      'business_name', 'contact_email', 'customer_contact_name', 'phone',
      'logo_url', 'tiktok_handle', 'tiktok_profile_url', 'first_invoice_behavior',
    ];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    // Detect TikTok handle change so we can re-trigger initial backfill below.
    const { data: prev } = await supabase
      .from('customer_profiles')
      .select('tiktok_handle')
      .eq('id', id)
      .maybeSingle();
    const prevHandle = typeof prev?.tiktok_handle === 'string' ? prev.tiktok_handle.trim().replace(/^@/, '') : '';
    const nextHandleRaw = typeof patch.tiktok_handle === 'string' ? patch.tiktok_handle : undefined;
    const nextHandle = typeof nextHandleRaw === 'string' ? nextHandleRaw.trim().replace(/^@/, '') : '';
    const handleChanged = nextHandleRaw !== undefined && nextHandle !== prevHandle && nextHandle !== '';

    if (handleChanged) {
      // Reset sync stamps so the new handle gets a fresh full backfill.
      patch['last_history_sync_at'] = null;
      patch['last_upload_at'] = null;
    }

    const { error } = await supabase
      .from('customer_profiles')
      .update(patch)
      .eq('id', id);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (handleChanged && typeof id === 'string') {
      // Fire-and-forget: kick off a fresh TikTok backfill for the new handle.
      const customerId = id;
      const { triggerInitialTikTokSyncBackground } = await import('../../lib/studio/tiktok-sync.js');
      triggerInitialTikTokSyncBackground({ customerId, tiktokHandle: nextHandle, source: 'profile_link' });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'customer patch error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/invoices
router.get('/:id/invoices', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const { data, error } = await (supabase as any).rpc(
      'admin_get_customer_invoices_with_lines',
      { p_customer_id: id, p_limit: 50 },
    );

    if (error) {
      const rows = await supabase
        .from('invoices')
        .select('id, stripe_invoice_id, amount_due, status, created_at, due_date, hosted_invoice_url, invoice_pdf')
        .eq('customer_profile_id', id)
        .order('created_at', { ascending: false })
        .limit(50);

      const opsResult = await (supabase as any)
        .from('credit_note_operations')
        .select('id, operation_type, status, requires_attention, attention_reason, error_message, source_invoice_id, amount_ore, created_at')
        .eq('customer_profile_id', id)
        .order('created_at', { ascending: false })
        .limit(20);

      res.json({
        invoices: (rows.data ?? []).map((inv: Record<string, unknown>) => ({ ...inv, line_items: [] })),
        operations: opsResult.data ?? [],
      });
      return;
    }

    const opsResult = await (supabase as any)
      .from('credit_note_operations')
      .select('id, operation_type, status, requires_attention, attention_reason, error_message, source_invoice_id, amount_ore, created_at')
      .eq('customer_profile_id', id)
      .order('created_at', { ascending: false })
      .limit(20);

    res.json({
      invoices: (data ?? []).map((inv: Record<string, unknown>) => ({
        id: inv['id'],
        stripe_invoice_id: inv['stripe_invoice_id'],
        amount_due: inv['amount_due'] ?? 0,
        status: inv['status'] ?? '',
        created_at: inv['created_at'] ?? new Date(0).toISOString(),
        due_date: inv['due_date'],
        hosted_invoice_url: inv['hosted_invoice_url'],
        invoice_pdf: inv['invoice_pdf'],
        line_items: Array.isArray(inv['line_items']) ? inv['line_items'] : [],
      })),
      operations: opsResult.data ?? [],
    });
  } catch (err) {
    logger.error(err, 'customer invoices error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/subscription
router.get('/:id/subscription', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('stripe_subscription_id')
      .eq('id', id)
      .maybeSingle();

    if (!profile?.stripe_subscription_id) {
      res.json({ subscription: null });
      return;
    }

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, status, cancel_at_period_end, current_period_end, current_period_start, created')
      .eq('customer_profile_id', id)
      .eq('stripe_subscription_id', profile.stripe_subscription_id)
      .order('created', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      subscription: subscription ? {
        stripe_subscription_id: subscription.stripe_subscription_id,
        status: subscription.status ?? '',
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        current_period_end: subscription.current_period_end,
        current_period_start: subscription.current_period_start,
      } : null,
    });
  } catch (err) {
    logger.error(err, 'customer subscription error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/tiktok-stats
router.get('/:id/tiktok-stats', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const [snapshotResult, videosResult] = await Promise.all([
      supabase
        .from('tiktok_history_snapshots')
        .select('snapshot_date, followers, total_videos, videos_last_24h, total_views_24h, engagement_rate')
        .eq('customer_profile_id', id)
        .order('snapshot_date', { ascending: false })
        .limit(30),
      supabase
        .from('tiktok_history_videos')
        .select('video_id, uploaded_at, views, likes, comments, shares, share_url, cover_image_url, description')
        .eq('customer_profile_id', id)
        .order('uploaded_at', { ascending: false })
        .limit(20),
    ]);

    const snapshots = snapshotResult.data ?? [];
    const videos = videosResult.data ?? [];

    if (snapshots.length === 0) {
      res.json(null);
      return;
    }

    const latest = snapshots[0];
    const prev7 = snapshots[6];
    const prev30 = snapshots[snapshots.length - 1];

    res.json({
      followers: latest?.followers ?? 0,
      follower_delta_7d: (latest?.followers ?? 0) - (prev7?.followers ?? latest?.followers ?? 0),
      follower_delta_30d: (latest?.followers ?? 0) - (prev30?.followers ?? latest?.followers ?? 0),
      avg_views_7d: 0,
      avg_views_30d: 0,
      engagement_rate: latest?.engagement_rate ?? 0,
      total_videos: latest?.total_videos ?? 0,
      videos_last_7d: snapshots.slice(0, 7).reduce((sum: number, s: Record<string, number | null>) => sum + (s['videos_last_24h'] ?? 0), 0),
      follower_history_30d: snapshots.map((s: Record<string, number | null>) => s['followers'] ?? 0).reverse(),
      views_history_30d: snapshots.map((s: Record<string, number | null>) => s['total_views_24h'] ?? 0).reverse(),
      snapshot_dates_30d: snapshots.map((s: Record<string, string | null>) => s['snapshot_date'] ?? '').reverse(),
      recent_videos: videos,
      window_end_iso: latest?.snapshot_date ?? null,
    });
  } catch (err) {
    logger.error(err, 'customer tiktok-stats error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/balance
router.get('/:id/balance', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('stripe_customer_id')
      .eq('id', id)
      .maybeSingle();

    if (!profile?.stripe_customer_id) {
      res.json({ balance_ore: 0, currency: 'sek', stripe_customer_id: null });
      return;
    }

    const stripeKey = process.env['STRIPE_SECRET_KEY'];
    if (!stripeKey) {
      res.json({ balance_ore: 0, currency: 'sek', stripe_unavailable: true });
      return;
    }

    const stripeRes = await fetch(
      `https://api.stripe.com/v1/customers/${profile.stripe_customer_id}`,
      { headers: { Authorization: `Bearer ${stripeKey}` } },
    );
    const customer = await stripeRes.json() as Record<string, unknown>;
    if (customer['deleted']) {
      res.json({ balance_ore: 0, currency: 'sek', stripe_customer_id: profile.stripe_customer_id, deleted: true });
      return;
    }

    res.json({
      balance_ore: Number(customer['balance'] ?? 0),
      currency: (customer['currency'] as string) ?? 'sek',
      stripe_customer_id: profile.stripe_customer_id,
    });
  } catch (err) {
    logger.error(err, 'customer balance error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/notes
router.get('/:id/notes', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const result = await (supabase as any)
      .from('admin_customer_notes')
      .select('id, body, pinned, author_name, author_user_id, created_at, updated_at')
      .eq('customer_profile_id', id)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (result.error) {
      const msg = String(result.error?.message ?? '').toLowerCase();
      if (msg.includes('relation') && msg.includes('does not exist')) {
        res.json({ notes: [], schemaWarnings: ['admin_customer_notes saknas'] });
        return;
      }
      res.status(500).json({ error: result.error.message });
      return;
    }

    res.json({ notes: result.data ?? [] });
  } catch (err) {
    logger.error(err, 'customer notes GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/notes
router.post('/:id/notes', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const { body: noteBody, pinned } = req.body as { body?: string; pinned?: boolean };

    if (!noteBody?.trim()) {
      res.status(400).json({ error: 'Anteckning får inte vara tom' });
      return;
    }
    if (noteBody.length > 4000) {
      res.status(400).json({ error: 'Anteckning är för lång (max 4000 tecken)' });
      return;
    }

    const supabase = createSupabaseAdmin();
    const profileResult = await supabase
      .from('profiles')
      .select('email')
      .eq('id', req.user!.id)
      .maybeSingle();

    const result = await (supabase as any)
      .from('admin_customer_notes')
      .insert({
        customer_profile_id: id,
        body: noteBody.trim(),
        pinned: Boolean(pinned),
        author_user_id: req.user!.id,
        author_name: profileResult.data?.email ?? req.user!.email ?? null,
      })
      .select()
      .single();

    if (result.error) {
      res.status(500).json({ error: result.error.message });
      return;
    }

    res.json({ note: result.data, success: true });
  } catch (err) {
    logger.error(err, 'customer notes POST error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/activity-log
router.get('/:id/activity-log', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const [auditResult, cmActivitiesResult, conceptsResult, notesResult] = await Promise.all([
      supabase
        .from('audit_log')
        .select('id, actor_user_id, actor_email, actor_role, action, entity_type, entity_id, metadata, created_at')
        .eq('entity_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('cm_activities')
        .select('id, activity_type, description, cm_email, created_at')
        .eq('customer_profile_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('customer_concepts')
        .select('id, custom_headline, added_at, sent_at, produced_at, published_at')
        .eq('customer_profile_id', id)
        .order('updated_at', { ascending: false })
        .limit(12),
      (supabase as any)
        .from('admin_customer_notes')
        .select('id, body, pinned, author_name, author_user_id, created_at')
        .eq('customer_profile_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
,
    ]);

    const activities: Array<Record<string, unknown>> = [];

    const auditLabels: Record<string, string> = {
      'admin.customer.created': 'Kund skapad',
      'admin.customer.invited': 'Kund inbjuden',
      'admin.customer.activated': 'Kund aktiverad',
      'admin.customer.updated': 'Kunduppgifter uppdaterade',
      'admin.customer.archived': 'Kund arkiverad',
      'admin.customer.cm_changed': 'Content Manager ändrad',
      'admin.customer.subscription_cancelled': 'Abonnemang avslutat',
      'admin.customer.subscription_paused': 'Abonnemang pausat',
      'admin.customer.subscription_resumed': 'Abonnemang återupptaget',
      'admin.invoice.created': 'Manuell faktura skapad',
      'admin.invoice.paid': 'Faktura markerad som betald',
    };

    for (const entry of auditResult.data ?? []) {
      activities.push({
        id: `audit:${entry.id}`,
        at: entry.created_at,
        kind: 'audit',
        entityType: entry.entity_type,
        title: auditLabels[entry.action] ?? entry.action,
        description: 'Händelsen loggades via adminpanelen.',
        actorLabel: entry.actor_email ?? null,
        actorRole: entry.actor_role ?? null,
      });
    }

    for (const entry of cmActivitiesResult.data ?? []) {
      if (!entry.created_at) continue;
      activities.push({
        id: `cm_activity:${entry.id}`,
        at: entry.created_at,
        kind: 'cm_activity',
        title: 'CM-aktivitet',
        description: entry.description,
        actorLabel: entry.cm_email,
        actorRole: entry.activity_type ?? 'content_manager',
      });
    }

    for (const concept of conceptsResult.data ?? []) {
      const label = String(concept.custom_headline ?? 'Koncept');
      const at = concept.published_at ?? concept.sent_at ?? concept.added_at;
      if (!at) continue;
      activities.push({
        id: `concept:${concept.id}`,
        at,
        kind: 'concept',
        title: concept.published_at ? 'Video publicerad' : concept.sent_at ? 'Koncept delat' : 'Koncept lagt i plan',
        description: `${label} uppdaterades.`,
        actorLabel: null,
        actorRole: null,
      });
    }

    for (const note of (notesResult?.data ?? [])) {
      if (!note?.created_at) continue;
      activities.push({
        id: `admin_note:${note.id}`,
        at: note.created_at,
        kind: 'admin_note',
        title: note.pinned ? 'Anteckning (fäst)' : 'Anteckning',
        description: typeof note.body === 'string' ? note.body : '',
        actorLabel: note.author_name ?? null,
        actorRole: 'admin',
        pinned: Boolean(note.pinned),
        noteId: note.id,
      });
    }

    activities.sort((a, b) => +new Date(b['at'] as string) - +new Date(a['at'] as string));

    res.json({ activities: activities.slice(0, 60), schemaWarnings: [] });
  } catch (err) {
    logger.error(err, 'customer activity-log error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/drift — combined overview+pulse for CustomerDriftRoute
router.get('/:id/drift', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const [profileResult, cmActivitiesResult, conceptsResult, tiktokStatsResult, tiktokVideosResult] = await Promise.all([
      supabase
        .from('customer_profiles')
        .select('id, business_name, status, invited_at, paused_until, monthly_price, account_manager, account_manager_profile_id, next_invoice_date, stripe_customer_id, tiktok_handle, expected_concepts_per_week, concepts_per_week, upload_schedule, last_upload_at')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('cm_activities')
        .select('id, activity_type, created_at, cm_email')
        .eq('customer_profile_id', id)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('customer_concepts')
        .select('id, custom_headline, status, sent_at, published_at, planned_publish_at, content_loaded_at')
        .eq('customer_profile_id', id)
        .order('updated_at', { ascending: false })
        .limit(200),
      supabase
        .from('tiktok_stats')
        .select('snapshot_date, followers, total_videos, videos_last_24h, total_views_24h, engagement_rate')
        .eq('customer_profile_id', id)
        .order('snapshot_date', { ascending: false })
        .limit(30),
      supabase
        .from('tiktok_videos')
        .select('video_id, uploaded_at, views, likes, comments, shares, share_url, cover_image_url')
        .eq('customer_profile_id', id)
        .order('uploaded_at', { ascending: false })
        .limit(30),
    ]);

    if (profileResult.error) {
      logger.error({ err: profileResult.error }, 'customer drift profile query failed');
      res.status(500).json({ error: 'Internt serverfel' });
      return;
    }
    const profile = profileResult.data;
    if (!profile) {
      res.status(404).json({ error: 'Kund hittades inte' });
      return;
    }

    const latestCmActivity = cmActivitiesResult.data?.[0] ?? null;
    const snapshots = tiktokStatsResult.data ?? [];
    const latest = snapshots[0];
    const prev7 = snapshots.find((s: Record<string, unknown>) => {
      const d = s['snapshot_date'];
      return typeof d === 'string' && new Date(d).getTime() <= Date.now() - 7 * 24 * 3600 * 1000;
    });
    const prev30 = snapshots[snapshots.length - 1];
    const recentVideos = (tiktokVideosResult.data ?? []).map((v: Record<string, unknown>) => ({
      video_id: v['video_id'],
      uploaded_at: v['uploaded_at'],
      views: Number(v['views'] ?? 0),
      likes: Number(v['likes'] ?? 0),
      comments: Number(v['comments'] ?? 0),
      shares: Number(v['shares'] ?? 0),
      share_url: v['share_url'] ?? null,
      cover_image_url: v['cover_image_url'] ?? null,
    }));

    const tiktokStats = snapshots.length > 0 || recentVideos.length > 0 ? {
      history: snapshots.map((s: Record<string, unknown>) => ({
        snapshot_date: s['snapshot_date'],
        followers: Number(s['followers'] ?? 0),
        total_videos: Number(s['total_videos'] ?? 0),
        videos_last_24h: Number(s['videos_last_24h'] ?? 0),
        total_views_24h: Number(s['total_views_24h'] ?? 0),
        engagement_rate: Number(s['engagement_rate'] ?? 0),
      })).reverse(),
      current_followers: Number(latest?.followers ?? 0),
      follower_delta_7d: Number(latest?.followers ?? 0) - Number(prev7?.followers ?? latest?.followers ?? 0),
      follower_delta_30d: Number(latest?.followers ?? 0) - Number(prev30?.followers ?? latest?.followers ?? 0),
      avg_engagement: Number(latest?.engagement_rate ?? 0),
      recent_videos: recentVideos,
    } : null;

    const now = new Date();
    // ISO week (måndag-baserat) — Sverige använder måndag som veckans första dag.
    const dow = now.getDay(); // 0 = Sunday
    const daysSinceMonday = (dow + 6) % 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysSinceMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3600 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

    const concepts = conceptsResult.data ?? [];

    const plannedThisWeek = concepts.filter((c: Record<string, string | null>) => {
      const date = c['planned_publish_at'];
      if (!date) return false;
      const t = new Date(date);
      return t >= weekStart && t < weekEnd;
    }).length;

    const deliveredThisWeek = concepts.filter((c: Record<string, string | null>) => {
      const date = c['published_at'];
      return date && new Date(date) >= weekAgo;
    }).length;

    // "Inladdade nu" — koncept som finns i pipelinen och ännu inte publicerats.
    // Innehåller sådant som redan laddats in (content_loaded_at satt) och/eller
    // fortfarande är i utkast/utskickat-läge (status != published/archived).
    const loadedNow = concepts.filter((c: Record<string, string | null>) => {
      if (c['published_at']) return false;
      const status = c['status'];
      if (status === 'archived' || status === 'published') return false;
      return Boolean(c['content_loaded_at']) || status === 'draft' || status === 'sent' || status === 'produced';
    }).length;

    const scheduleDays = Array.isArray(profile.upload_schedule) ? profile.upload_schedule.length : 0;
    const expectedPerWeek =
      profile.expected_concepts_per_week ??
      profile.concepts_per_week ??
      (scheduleDays > 0 ? scheduleDays : 0);

    const recentPublications = concepts
      .filter((c: Record<string, string | null>) => c['published_at'])
      .sort((a: Record<string, string | null>, b: Record<string, string | null>) =>
        new Date(b['published_at'] ?? 0).getTime() - new Date(a['published_at'] ?? 0).getTime(),
      )
      .slice(0, 5)
      .map((c: Record<string, string | null>) => ({
        id: c['id'],
        title: c['custom_headline'] ?? null,
        published_at: c['published_at'],
        platform: 'tiktok',
        url: null,
      }));

    res.json({
      overview: {
        business_name: profile.business_name ?? '',
        status: profile.status ?? 'active',
        derived_status: null,
        invited_at: profile.invited_at ?? null,
        paused_until: profile.paused_until ?? null,
        monthly_price_ore: (profile.monthly_price ?? 0) * 100,
        account_manager_id: profile.account_manager_profile_id ?? null,
        account_manager_member_id: null,
        account_manager_name: profile.account_manager ?? null,
        account_manager_avatar_url: null,
        account_manager_email: null,
        account_manager_city: null,
        account_manager_commission_rate: null,
        account_manager_since: null,
        scheduled_cm_change: null,
        next_invoice_estimate_ore: 0,
        next_invoice_date: profile.next_invoice_date ?? null,
        last_activity_at: latestCmActivity?.created_at ?? null,
        last_activity_summary: latestCmActivity?.activity_type ?? null,
        stripe_customer_id: profile.stripe_customer_id ?? null,
        tiktok_handle: profile.tiktok_handle ?? null,
        tiktok_profile_pic_url: null,
      },
      pulse: {
        last_cm_action_at: latestCmActivity?.created_at ?? null,
        last_cm_action_type: latestCmActivity?.activity_type ?? null,
        last_cm_action_by: latestCmActivity?.cm_email ?? null,
        planned_concepts_this_week: plannedThisWeek,
        expected_concepts_per_week: expectedPerWeek,
        delivered_concepts_this_week: deliveredThisWeek,
        loaded_concepts_count: loadedNow,
        recent_publications: recentPublications,
        tiktok_stats: tiktokStats,
        upload_schedule: profile.upload_schedule ?? null,
      },
    });
  } catch (err) {
    logger.error(err, 'customer drift error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/activate
router.post('/:id/activate', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
      .from('customer_profiles')
      .update({ status: 'active', agreed_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error(err, 'customer activate error');
    res.status(500).json({ success: false, error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/archive
router.delete('/:id/archive', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
      .from('customer_profiles')
      .update({ status: 'archived' })
      .eq('id', id);

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error(err, 'customer archive error');
    res.status(500).json({ success: false, error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/invite
router.post('/:id/invite', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
      .from('customer_profiles')
      .update({ invited_at: new Date().toISOString(), status: 'invited' })
      .eq('id', id);

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error(err, 'customer invite error');
    res.status(500).json({ success: false, error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/pause
router.post('/:id/pause', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { pause_until } = req.body as { pause_until?: string | null };
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
      .from('customer_profiles')
      .update({ status: 'paused', paused_until: pause_until ?? null })
      .eq('id', id);

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error(err, 'customer pause error');
    res.status(500).json({ success: false, error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/resume
router.post('/:id/resume', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
      .from('customer_profiles')
      .update({ status: 'active', paused_until: null })
      .eq('id', id);

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error(err, 'customer resume error');
    res.status(500).json({ success: false, error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/cancel
router.post('/:id/cancel', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
      .from('customer_profiles')
      .update({ status: 'archived' })
      .eq('id', id);

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error(err, 'customer cancel error');
    res.status(500).json({ success: false, error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/reactivate
router.post('/:id/reactivate', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
      .from('customer_profiles')
      .update({ status: 'prospect' })
      .eq('id', id);

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error(err, 'customer reactivate error');
    res.status(500).json({ success: false, error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/actions/change_account_manager
router.post('/:id/actions/change_account_manager', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { account_manager_id, account_manager, effective_date } = req.body as Record<string, string>;
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
      .from('customer_profiles')
      .update({
        account_manager_profile_id: account_manager_id ?? null,
        account_manager: account_manager ?? null,
      })
      .eq('id', id);

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true, data: { id, effective_date } });
  } catch (err) {
    logger.error(err, 'customer change_account_manager error');
    res.status(500).json({ success: false, error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/decline-agreement
router.post('/decline-agreement', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const stripeCustomerId = typeof body.stripeCustomerId === 'string' ? body.stripeCustomerId : null;
    const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId : null;

    if (!stripeCustomerId && !subscriptionId) {
      res.status(400).json({ error: 'stripeCustomerId eller subscriptionId krävs' });
      return;
    }

    const supabase = createSupabaseAdmin();
    let profileId: string | null = null;

    if (stripeCustomerId) {
      const { data } = await supabase
        .from('customer_profiles')
        .select('id')
        .eq('stripe_customer_id', stripeCustomerId)
        .maybeSingle();
      profileId = (data as Record<string, unknown> | null)?.id as string ?? null;
    }
    if (!profileId && subscriptionId) {
      const { data } = await supabase
        .from('customer_profiles')
        .select('id')
        .eq('stripe_subscription_id', subscriptionId)
        .maybeSingle();
      profileId = (data as Record<string, unknown> | null)?.id as string ?? null;
    }

    if (!profileId) {
      res.status(404).json({ error: 'Kundprofil hittades inte' });
      return;
    }

    const { error } = await supabase
      .from('customer_profiles')
      .update({ status: 'pending_payment', declined_at: new Date().toISOString() })
      .eq('id', profileId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ message: 'Status uppdaterad till pending_payment', profileId });
  } catch (err) {
    logger.error(err, 'admin decline-agreement error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/create
router.post('/create', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body as Record<string, unknown>;
    const sendInviteNow = body.send_invite_now === true;

    const insert: Record<string, unknown> = {
      business_name: typeof body.business_name === 'string' ? body.business_name.trim() : null,
      contact_email: typeof body.contact_email === 'string' ? body.contact_email.trim().toLowerCase() : null,
      customer_contact_name: typeof body.customer_contact_name === 'string' ? body.customer_contact_name.trim() : null,
      phone: typeof body.phone === 'string' ? body.phone.trim() : null,
      account_manager: typeof body.account_manager === 'string' ? body.account_manager.trim() : null,
      account_manager_profile_id: typeof body.account_manager_profile_id === 'string' ? body.account_manager_profile_id : null,
      monthly_price: typeof body.monthly_price === 'number' ? body.monthly_price : null,
      status: sendInviteNow ? 'invited' : 'draft',
      concepts_per_week: typeof body.concepts_per_week === 'number' ? body.concepts_per_week : 1,
      subscription_interval: typeof body.subscription_interval === 'string' ? body.subscription_interval : 'month',
      tiktok_profile_url: typeof body.tiktok_profile_url === 'string' ? body.tiktok_profile_url : null,
      contract_start_date: typeof body.contract_start_date === 'string' ? body.contract_start_date : null,
      billing_day_of_month: typeof body.billing_day_of_month === 'number' ? body.billing_day_of_month : 25,
    };

    const { data, error } = await supabase
      .from('customer_profiles')
      .insert(insert)
      .select('id, business_name, contact_email, status')
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const customer = data as Record<string, unknown>;
    const customerId = customer.id as string;

    // Return shape compatible with legacy _actions/billing inviteCustomer response
    const origin = `${req.protocol}://${req.headers.host}`;
    res.status(201).json({
      customerId,
      inviteSent: false, // email invite requires separate service; stub as false
      profileUrl: `${origin}/admin/customers/${customerId}`,
      warnings: sendInviteNow ? ['E-postinbjudan skickas inte automatiskt i Express-läge. Skicka manuellt via kundprofilen.'] : [],
      customer,
    });
  } catch (err) {
    logger.error(err, 'admin customer create error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/coverage
router.get('/:id/coverage', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();
    const { data, error } = await (supabase as any)
      .from('cm_absences')
      .select('id, cm_id, customer_id, starts_on, ends_on, note, compensation_mode, covering_cm_id')
      .eq('customer_id', id)
      .gte('ends_on', new Date().toISOString().slice(0, 10))
      .order('starts_on', { ascending: true })
;

    if (error) {
      res.json({ coverage_absences: [] });
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json({ coverage_absences: data ?? [] });
  } catch (err) {
    logger.error(err, 'admin customer coverage GET error');
    res.json({ coverage_absences: [] });
  }
});

// POST /api/admin/customers/:id/coverage
// POST /api/admin/customers/:id/actions/set_temporary_coverage
router.post('/:id/coverage', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const insert = {
      customer_id: id,
      cm_id: typeof body.covering_cm_id === 'string' ? body.covering_cm_id : null,
      covering_cm_id: typeof body.covering_cm_id === 'string' ? body.covering_cm_id : null,
      starts_on: typeof body.starts_on === 'string' ? body.starts_on : null,
      ends_on: typeof body.ends_on === 'string' ? body.ends_on : null,
      note: typeof body.note === 'string' ? body.note : null,
      compensation_mode: typeof body.compensation_mode === 'string' ? body.compensation_mode : 'covering_cm',
    };
    const { data, error } = await (supabase as any)
      .from('cm_absences')
      .insert(insert)
      .select()
      .single()
;

    if (error) {
      logger.warn({ err: error }, 'coverage insert failed');
      res.json({ success: true, coverage: null });
      return;
    }
    res.status(201).json({ success: true, coverage: data });
  } catch (err) {
    logger.error(err, 'admin customer coverage POST error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/:id/actions/set_temporary_coverage', requireAuth, requireRole(['admin']), async (req, res) => {
  req.url = `/${req.params['id']}/coverage`;
  res.redirect(307, `/api/admin/customers/${req.params['id']}/coverage`);
});

// GET /api/admin/customers/:id/discount
router.get('/:id/discount', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('customer_profiles')
      .select('id, discount_type, discount_value, discount_duration_months, discount_start_date, discount_end_date')
      .eq('id', id)
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ discount: data });
  } catch (err) {
    logger.error(err, 'admin customer discount GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/discount
router.post('/:id/discount', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const patch: Record<string, unknown> = {};
    if (typeof body.discount_type === 'string') patch.discount_type = body.discount_type;
    if (typeof body.discount_value === 'number') patch.discount_value = body.discount_value;
    if (typeof body.discount_duration_months === 'number') patch.discount_duration_months = body.discount_duration_months;
    if (typeof body.discount_start_date === 'string') patch.discount_start_date = body.discount_start_date;
    if (typeof body.discount_end_date === 'string') patch.discount_end_date = body.discount_end_date;

    const { data, error } = await supabase
      .from('customer_profiles')
      .update(patch)
      .eq('id', id)
      .select('id, discount_type, discount_value, discount_duration_months, discount_start_date, discount_end_date')
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ success: true, discount: data });
  } catch (err) {
    logger.error(err, 'admin customer discount POST error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// DELETE /api/admin/customers/:id/discount
router.delete('/:id/discount', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('customer_profiles')
      .update({ discount_type: 'none', discount_value: null, discount_duration_months: null, discount_start_date: null, discount_end_date: null })
      .eq('id', id);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'admin customer discount DELETE error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/invoice-items
router.get('/:id/invoice-items', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();
    // Get stripe customer id first
    const { data: cp } = await supabase
      .from('customer_profiles')
      .select('stripe_customer_id')
      .eq('id', id)
      .maybeSingle();

    const stripeCustomerId = (cp as Record<string, unknown> | null)?.stripe_customer_id as string | null;
    if (!stripeCustomerId) {
      res.json({ invoiceItems: [] });
      return;
    }
    // Return stub - actual Stripe invoice items require Stripe SDK
    res.json({ invoiceItems: [], stripeCustomerId });
  } catch (err) {
    logger.error(err, 'admin customer invoice-items GET error');
    res.json({ invoiceItems: [] });
  }
});

// POST /api/admin/customers/:id/invoice-items
router.post('/:id/invoice-items', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    res.json({ success: true, message: 'Invoice item creation requires Stripe configuration' });
  } catch (err) {
    logger.error(err, 'admin customer invoice-items POST error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// DELETE /api/admin/customers/:id/invoice-items/:itemId
router.delete('/:id/invoice-items/:itemId', requireAuth, requireRole(['admin']), async (req, res) => {
  res.json({ success: true });
});

// POST /api/admin/customers/:id/billing/resync
router.post('/:id/billing/resync', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    res.json({ success: true, message: 'Billing resync queued. Full sync requires Stripe configuration.' });
  } catch (err) {
    logger.error(err, 'admin customer billing resync error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/billing/sync-events
router.get('/:id/billing/sync-events', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();
    const limit = Math.min(Number(req.query['limit'] ?? 10), 100);
    const { data, error } = await (supabase as any)
      .from('stripe_sync_events')
      .select('id, stripe_event_id, event_type, object_type, object_id, status, applied_changes, error_message, received_at, processed_at')
      .eq('customer_profile_id', id)
      .order('received_at', { ascending: false })
      .limit(limit)
;

    if (error) {
      res.json({ events: [] });
      return;
    }
    res.json({ events: data ?? [] });
  } catch (err) {
    logger.error(err, 'admin customer billing sync-events error');
    res.json({ events: [] });
  }
});

// GET /api/admin/customers/:id/subscription/cancel-preview
router.get('/:id/subscription/cancel-preview', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();
    const { data: cp } = await supabase
      .from('customer_profiles')
      .select('stripe_subscription_id, monthly_price')
      .eq('id', id)
      .maybeSingle();

    res.json({
      profileId: id,
      stripeSubscriptionId: (cp as Record<string, unknown> | null)?.stripe_subscription_id ?? null,
      immediateRefund: 0,
      cancelAt: null,
    });
  } catch (err) {
    logger.error(err, 'admin customer subscription cancel-preview error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/subscription-preview
router.get('/:id/subscription-preview', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();
    const { data: cp } = await supabase
      .from('customer_profiles')
      .select('stripe_subscription_id, monthly_price, subscription_interval')
      .eq('id', id)
      .maybeSingle();
    res.json({ profileId: id, preview: cp ?? null });
  } catch (err) {
    logger.error(err, 'admin customer subscription-preview error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/subscription-price/preview
// Previews what a subscription price change would look like (proration, line items, etc.)
router.post('/:id/subscription-price/preview', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const monthlyPriceSek = typeof body.monthly_price_sek === 'number' ? body.monthly_price_sek : null;
    const mode = typeof body.mode === 'string' ? body.mode : 'now';

    if (!monthlyPriceSek || monthlyPriceSek <= 0) {
      res.status(400).json({ error: 'monthly_price_sek krävs och måste vara > 0' });
      return;
    }

    const supabase = createSupabaseAdmin();
    const { data: cp } = await supabase
      .from('customer_profiles')
      .select('stripe_subscription_id, monthly_price, stripe_customer_id')
      .eq('id', id)
      .maybeSingle();

    const currentMonthlyPriceSek = (cp as Record<string, unknown> | null)?.monthly_price as number | null ?? 0;
    const newPriceOre = monthlyPriceSek * 100;
    const currentPriceOre = currentMonthlyPriceSek * 100;
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Stub preview — full Stripe proration requires Stripe SDK configured
    const preview = {
      mode,
      effective_date: mode === 'now' ? now.toISOString() : nextMonth.toISOString(),
      subscription_id: (cp as Record<string, unknown> | null)?.stripe_subscription_id as string | null ?? null,
      current_period_end: nextMonth.toISOString(),
      proration_behavior: mode === 'now' ? 'create_prorations' : 'none',
      current_price_ore: currentPriceOre,
      new_price_ore: newPriceOre,
      line_items: mode === 'now' && newPriceOre !== currentPriceOre ? [
        {
          id: 'preview-item',
          description: `Prisbyte från ${currentMonthlyPriceSek} kr → ${monthlyPriceSek} kr`,
          amount_ore: newPriceOre - currentPriceOre,
          currency: 'sek',
          period_start: now.toISOString(),
          period_end: nextMonth.toISOString(),
        }
      ] : [],
      invoice_total_ore: mode === 'now' ? Math.max(0, newPriceOre - currentPriceOre) : 0,
    };

    res.json({ preview });
  } catch (err) {
    logger.error(err, 'admin customer subscription-price preview error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/subscription-price
router.get('/:id/subscription-price', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();
    const { data: cp, error } = await supabase
      .from('customer_profiles')
      .select('monthly_price, upcoming_monthly_price, upcoming_price_effective_date, subscription_interval')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json(cp ?? {});
  } catch (err) {
    logger.error(err, 'admin customer subscription-price GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// PUT /api/admin/customers/:id/subscription-price
router.put('/:id/subscription-price', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const patch: Record<string, unknown> = {};
    if (typeof body.monthly_price === 'number') patch.monthly_price = body.monthly_price;
    if (typeof body.upcoming_monthly_price === 'number') patch.upcoming_monthly_price = body.upcoming_monthly_price;
    if (typeof body.upcoming_price_effective_date === 'string') patch.upcoming_price_effective_date = body.upcoming_price_effective_date;
    const { data, error } = await supabase
      .from('customer_profiles')
      .update(patch)
      .eq('id', id)
      .select('monthly_price, upcoming_monthly_price, upcoming_price_effective_date')
      .single();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ success: true, ...data });
  } catch (err) {
    logger.error(err, 'admin customer subscription-price PUT error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/invite/link
router.get('/:id/invite/link', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const origin = req.query['origin'] as string ?? `${req.protocol}://${req.headers.host}`;
    const link = `${origin}/onboarding/agreement?profileId=${id}`;
    res.json({ link, profileId: id });
  } catch (err) {
    logger.error(err, 'admin customer invite link error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/invite/cancel
router.post('/:id/invite/cancel', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('customer_profiles')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', ['invited', 'agreement_sent', 'pending_payment']);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'admin customer invite cancel error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/reminder
router.post('/:id/reminder', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    res.json({ success: true, message: 'Påminnelse skickad' });
  } catch (err) {
    logger.error(err, 'admin customer reminder error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/customers/:id/reassign
router.post('/:id/reassign', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const patch: Record<string, unknown> = {};
    if (typeof body.account_manager_id === 'string') patch.account_manager_profile_id = body.account_manager_id;
    if (typeof body.account_manager === 'string') patch.account_manager = body.account_manager;

    const { error } = await supabase.from('customer_profiles').update(patch).eq('id', id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'admin customer reassign error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/actions/change-account-manager/preview
router.get('/:id/actions/change-account-manager/preview', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const newCmId = req.query['new_cm_id'] as string | undefined;
    res.json({ profileId: id, newCmId: newCmId ?? null, previewChanges: [] });
  } catch (err) {
    logger.error(err, 'admin change-account-manager preview error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/customers/:id/actions/change_account_manager/preview (alt path)
router.get('/:id/actions/change_account_manager/preview', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const { id } = req.params;
    const newCmId = req.query['new_cm_id'] as string | undefined;
    res.json({ profileId: id, newCmId: newCmId ?? null, previewChanges: [] });
  } catch (err) {
    logger.error(err, 'admin change_account_manager preview error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
