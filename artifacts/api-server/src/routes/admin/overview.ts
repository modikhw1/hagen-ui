import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin', 'content_manager']);

function formatSek(ore: number) {
  const sek = Math.round(ore / 100);
  return `${sek.toLocaleString('sv-SE')} kr`;
}

// GET /api/admin/overview/metrics
router.get('/metrics', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [customersResult, subscriptionsResult, demosResult] = await Promise.all([
      supabase
        .from('customer_profiles')
        .select('id, status, paused_until, agreed_at, created_at, monthly_price'),
      supabase
        .from('subscriptions')
        .select('status, amount, created, canceled_at')
        .in('status', ['active', 'trialing', 'paused']),
      supabase
        .from('demos')
        .select('id, status, status_changed_at, resolved_at')
        .gte('status_changed_at', since),
    ]);

    const customers = customersResult.data ?? [];
    const subscriptions = subscriptionsResult.data ?? [];
    const demos = demosResult.data ?? [];

    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    const activeCount = customers.filter(
      (c: Record<string, unknown>) => c['status'] === 'active' && !c['paused_until'],
    ).length;
    const newWithin = customers.filter((c: Record<string, string | null>) => {
      const at = c['agreed_at'] ?? c['created_at'];
      return at && new Date(at) >= cutoff;
    }).length;
    const churnedWithin = customers.filter((c: Record<string, string | null>) => {
      return c['status'] === 'archived' && c['created_at'] && new Date(c['created_at']) >= cutoff;
    }).length;

    const mrrNow = subscriptions.reduce((sum: number, s: Record<string, unknown>) => {
      return sum + (Number(s['amount'] ?? 0));
    }, 0);

    const sentDemos = demos.filter((d: Record<string, string>) =>
      ['sent', 'opened', 'responded', 'won', 'lost'].includes(d['status']),
    ).length;
    const convertedDemos = demos.filter((d: Record<string, string>) => d['status'] === 'won').length;

    const net = newWithin - churnedWithin;

    res.json({
      metrics: {
        revenueCard: {
          label: 'Månatliga intäkter',
          value: formatSek(mrrNow),
          delta: { text: '30d', tone: 'muted' },
          sub: '30d',
        },
        activeCard: {
          label: 'Aktiva kunder',
          value: String(activeCount),
          delta: net === 0 ? undefined : {
            text: `(${net > 0 ? '+' : ''}${net})`,
            tone: net > 0 ? 'success' : 'destructive',
          },
          sub: '30d',
        },
        demosCard: {
          label: 'Demos skickade',
          value: String(sentDemos),
          sub: `${convertedDemos} konverterade`,
        },
        costsCard: {
          label: 'Kostnad 30d',
          value: '0 kr',
          sub: '30d',
        },
      },
    });
  } catch (err) {
    logger.error(err, 'overview metrics error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/overview/attention
router.get('/attention', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    const [customersResult, snoozesResult, overdueInvoicesResult] = await Promise.all([
      supabase
        .from('customer_profiles')
        .select('id, business_name, status, paused_until, agreed_at, monthly_price, account_manager, next_invoice_date, tiktok_handle, stripe_customer_id, stripe_subscription_id, invited_at, derived_status, cm_avatar_url, account_manager_profile_id')
        .in('status', ['active', 'paused', 'invited'])
        .order('business_name'),
      supabase
        .from('attention_snoozes')
        .select('subject_type, subject_id, snoozed_until, released_at'),
      supabase
        .from('invoices')
        .select('id, customer_profile_id, amount_due, due_date, status')
        .eq('status', 'open')
        .lt('due_date', today)
        .order('due_date', { ascending: true })
        .limit(500),
    ]);

    const now = new Date();
    const snoozed = new Set(
      (snoozesResult.data ?? [])
        .filter((s: Record<string, string | null>) => {
          const until = s['snoozed_until'] ? new Date(s['snoozed_until']) : null;
          return until && until > now && !s['released_at'];
        })
        .map((s: Record<string, string>) => s['subject_id']),
    );

    const overdueByCustomer = new Map<string, number>();
    for (const inv of overdueInvoicesResult.data ?? []) {
      const cid = inv.customer_profile_id as string;
      overdueByCustomer.set(cid, (overdueByCustomer.get(cid) ?? 0) + (inv.amount_due ?? 0));
    }

    const attentionItems: Array<Record<string, unknown>> = [];
    const snoozedItems: Array<Record<string, unknown>> = [];

    for (const customer of customersResult.data ?? []) {
      const cid = customer.id as string;
      const isOverdue = overdueByCustomer.has(cid);
      const isPaused = customer.status === 'paused';
      const isInvited = customer.status === 'invited';

      if (!isOverdue && !isPaused && !isInvited) continue;

      const item = {
        id: cid,
        business_name: customer.business_name,
        status: customer.status,
        derived_status: customer.derived_status ?? null,
        monthly_price_ore: (customer.monthly_price ?? 0) * 100,
        account_manager_name: customer.account_manager ?? null,
        account_manager_id: customer.account_manager_profile_id ?? null,
        account_manager_avatar_url: customer.cm_avatar_url ?? null,
        paused_until: customer.paused_until ?? null,
        stripe_customer_id: customer.stripe_customer_id ?? null,
        stripe_subscription_id: customer.stripe_subscription_id ?? null,
        invited_at: customer.invited_at ?? null,
        overdue_amount_ore: overdueByCustomer.get(cid) ?? 0,
        attention_reasons: [
          ...(isOverdue ? ['overdue_invoice'] : []),
          ...(isPaused ? ['paused'] : []),
          ...(isInvited ? ['pending_invite'] : []),
        ],
      };

      if (snoozed.has(cid)) {
        snoozedItems.push(item);
      } else {
        attentionItems.push(item);
      }
    }

    res.json({
      attentionItems,
      snoozedAttentionItems: snoozedItems,
      snoozedCount: snoozedItems.length,
      attentionFeedSeenAt: null,
    });
  } catch (err) {
    logger.error(err, 'overview attention error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/overview/cm-pulse
router.get('/cm-pulse', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();

    const [teamResult, assignmentsResult, customersResult] = await Promise.all([
      supabase
        .from('team_members')
        .select('id, name, email, role, is_active, avatar_url, commission_rate')
        .in('role', ['content_manager', 'admin'])
        .eq('is_active', true),
      supabase
        .from('cm_assignments')
        .select('customer_id, cm_id')
        .is('valid_to', null),
      supabase
        .from('customer_profiles')
        .select('id, status, expected_concepts_per_week, last_upload_at, last_published_at, account_manager_profile_id')
        .in('status', ['active', 'paused']),
    ]);

    const customersByCm = new Map<string, typeof customersResult.data>();
    for (const assignment of assignmentsResult.data ?? []) {
      const cid = assignment.cm_id as string;
      if (!customersByCm.has(cid)) customersByCm.set(cid, []);
      const customer = (customersResult.data ?? []).find(
        (c: Record<string, string>) => c['id'] === assignment.customer_id,
      );
      if (customer) customersByCm.get(cid)!.push(customer);
    }

    const cmPulse = (teamResult.data ?? []).map((member: Record<string, unknown>) => {
      const cmId = member['id'] as string;
      const customers = customersByCm.get(cmId) ?? [];
      const expected = customers.reduce(
        (sum: number, c: Record<string, unknown>) => sum + Number(c['expected_concepts_per_week'] ?? 0),
        0,
      );
      const totalCustomers = customers.length;
      return {
        member: {
          id: cmId,
          name: member['name'],
          email: member['email'],
          avatar_url: member['avatar_url'] ?? null,
          created_at: null,
        },
        aggregate: {
          cmId,
          status: 'ok' as const,
          activeAbsence: null,
          counts: { n_under: 0, n_thin: 0, n_blocked: 0, n_ok: totalCustomers, n_paused: 0 },
          totalCustomers,
          lastInteractionAt: null,
          last_interaction_days: 999,
          planned_concepts_total: 0,
          expected_concepts_7d: expected,
          fillPct: expected === 0 ? 100 : 0,
          overflow: false,
          barLabel: `0/${expected} koncept`,
          interaction_count_7d: 0,
          newCustomers: [],
          recentPublications: [],
        },
      };
    });

    res.json({ cmPulse });
  } catch (err) {
    logger.error(err, 'overview cm-pulse error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/overview/costs
router.get('/costs', requireAuth, ADMIN_ONLY, async (_req, res) => {
  res.json({ entries: [], totalOre: 0 });
});

export default router;
