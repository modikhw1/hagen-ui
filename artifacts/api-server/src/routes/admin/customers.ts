import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();

const ADMIN_ONLY = requireRole(['admin', 'content_manager']);

const CUSTOMER_LIST_SELECT =
  'id, business_name, contact_email, customer_contact_name, phone, account_manager, account_manager_profile_id, monthly_price, subscription_interval, pricing_status, status, created_at, agreed_at, invited_at, concepts_per_week, expected_concepts_per_week, paused_until, onboarding_state, onboarding_state_changed_at, tiktok_handle, next_invoice_date, stripe_customer_id, stripe_subscription_id, cm_avatar_url, cm_initial_color';

const CUSTOMER_DETAIL_SELECT =
  'id, business_name, contact_email, customer_contact_name, phone, account_manager, account_manager_profile_id, monthly_price, subscription_interval, pricing_status, status, derived_status, created_at, agreed_at, invited_at, contract_start_date, billing_day_of_month, concepts_per_week, expected_concepts_per_week, paused_until, onboarding_state, onboarding_state_changed_at, tiktok_handle, tiktok_profile_url, tiktok_user_id, next_invoice_date, stripe_customer_id, stripe_subscription_id, discount_type, discount_value, discount_duration_months, discount_ends_at, upload_schedule, last_upload_at, latest_planned_publish_date, last_published_at, last_history_sync_at, cm_avatar_url, cm_initial_color, upcoming_price_change, invoice_text, scope_items';

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

    const [snoozesResult, absencesResult] = await Promise.all([
      supabase
        .from('attention_snoozes')
        .select('subject_type, subject_id, snoozed_until, released_at')
        .eq('subject_id', id),
      supabase
        .from('cm_absences')
        .select('cm_id, starts_on, ends_on')
        .order('starts_on', { ascending: false })
        .limit(10),
    ]);

    res.json({
      customer: {
        ...profile,
        attention_snoozes: snoozesResult.data ?? [],
        coverage_absences: absencesResult.data ?? [],
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

    const { error } = await supabase
      .from('customer_profiles')
      .update(patch)
      .eq('id', id);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
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
        .catch(() => ({ data: [], error: null })),
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

    const [profileResult, cmActivitiesResult, conceptsResult, tiktokResult] = await Promise.all([
      supabase
        .from('customer_profiles')
        .select('id, business_name, status, derived_status, invited_at, paused_until, monthly_price, account_manager, account_manager_profile_id, cm_avatar_url, next_invoice_date, stripe_customer_id, tiktok_handle, expected_concepts_per_week, upload_schedule')
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
        .select('id, custom_headline, sent_at, published_at, planned_publish_date')
        .eq('customer_profile_id', id)
        .order('updated_at', { ascending: false })
        .limit(10),
      supabase
        .from('tiktok_history_snapshots')
        .select('snapshot_date, followers, total_videos, videos_last_24h, total_views_24h, engagement_rate')
        .eq('customer_profile_id', id)
        .order('snapshot_date', { ascending: false })
        .limit(30),
    ]);

    const profile = profileResult.data;
    if (!profile) {
      res.status(404).json({ error: 'Kund hittades inte' });
      return;
    }

    const latestCmActivity = cmActivitiesResult.data?.[0] ?? null;
    const snapshots = tiktokResult.data ?? [];
    const latest = snapshots[0];
    const prev7 = snapshots[6];
    const prev30 = snapshots[snapshots.length - 1];

    const tiktokStats = snapshots.length > 0 ? {
      history: snapshots.map((s: Record<string, unknown>) => ({
        snapshot_date: s['snapshot_date'],
        followers: s['followers'],
        total_videos: s['total_videos'],
        videos_last_24h: s['videos_last_24h'],
        total_views_24h: s['total_views_24h'],
        engagement_rate: s['engagement_rate'],
      })).reverse(),
      current_followers: latest?.followers ?? 0,
      follower_delta_7d: (latest?.followers ?? 0) - (prev7?.followers ?? latest?.followers ?? 0),
      follower_delta_30d: (latest?.followers ?? 0) - (prev30?.followers ?? latest?.followers ?? 0),
      avg_engagement: latest?.engagement_rate ?? 0,
      recent_videos: [],
    } : null;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());

    const plannedThisWeek = (conceptsResult.data ?? []).filter((c: Record<string, string | null>) => {
      const date = c['planned_publish_date'];
      return date && new Date(date) >= weekStart;
    }).length;

    const recentPublications = (conceptsResult.data ?? [])
      .filter((c: Record<string, string | null>) => c['published_at'])
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
        derived_status: profile.derived_status ?? null,
        invited_at: profile.invited_at ?? null,
        paused_until: profile.paused_until ?? null,
        monthly_price_ore: (profile.monthly_price ?? 0) * 100,
        account_manager_id: profile.account_manager_profile_id ?? null,
        account_manager_member_id: null,
        account_manager_name: profile.account_manager ?? null,
        account_manager_avatar_url: profile.cm_avatar_url ?? null,
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
        expected_concepts_per_week: profile.expected_concepts_per_week ?? 0,
        delivered_concepts_this_week: 0,
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

export default router;
