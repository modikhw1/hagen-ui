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
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
    const todayIso = today.toISOString().slice(0, 10);

    const [teamResult, assignmentsResult, customersResult, conceptsResult, interactionsResult, absencesResult] =
      await Promise.all([
        supabase
          .from('team_members')
          .select('id, name, email, role, is_active, avatar_url, created_at')
          .in('role', ['content_manager', 'admin'])
          .eq('is_active', true),
        supabase.from('cm_assignments').select('customer_id, cm_id').is('valid_to', null),
        supabase
          .from('customer_profiles')
          .select(
            'id, business_name, status, paused_until, concepts_per_week, expected_concepts_per_week, onboarding_state, lifecycle_state',
          )
          .in('status', ['active', 'paused']),
        supabase
          .from('customer_concepts')
          .select('customer_id, planned_publish_at, published_at, status')
          .not('customer_id', 'is', null),
        supabase
          .from('cm_interactions')
          .select('cm_id, type, created_at')
          .gte('created_at', sevenDaysAgo.toISOString()),
        supabase
          .from('cm_absences')
          .select('cm_id, absence_type, starts_on, ends_on, backup_cm_id')
          .lte('starts_on', todayIso)
          .gte('ends_on', todayIso),
      ]);

    type CustomerRow = {
      id: string;
      business_name: string | null;
      status: string | null;
      paused_until: string | null;
      concepts_per_week: number | null;
      expected_concepts_per_week: number | null;
      onboarding_state: string | null;
      lifecycle_state: string | null;
    };

    const customers = (customersResult.data ?? []) as CustomerRow[];
    const customerById = new Map(customers.map((c) => [c.id, c]));

    type ConceptStats = {
      planned: number;
      overdue7d: number;
      latestPlanned: Date | null;
      lastPublished: Date | null;
    };
    const conceptsByCustomer = new Map<string, ConceptStats>();
    for (const concept of (conceptsResult.data ?? []) as Array<{
      customer_id: string;
      planned_publish_at: string | null;
      published_at: string | null;
      status: string | null;
    }>) {
      const cid = concept.customer_id;
      if (!cid) continue;
      let stats = conceptsByCustomer.get(cid);
      if (!stats) {
        stats = { planned: 0, overdue7d: 0, latestPlanned: null, lastPublished: null };
        conceptsByCustomer.set(cid, stats);
      }
      const publishedAt = concept.published_at ? new Date(concept.published_at) : null;
      const plannedAt = concept.planned_publish_at ? new Date(concept.planned_publish_at) : null;
      if (publishedAt) {
        if (!stats.lastPublished || publishedAt > stats.lastPublished) {
          stats.lastPublished = publishedAt;
        }
      } else if (plannedAt) {
        stats.planned += 1;
        if (!stats.latestPlanned || plannedAt > stats.latestPlanned) {
          stats.latestPlanned = plannedAt;
        }
        if (plannedAt < sevenDaysAgo) stats.overdue7d += 1;
      }
    }

    type InteractionStats = { count7d: number; lastAt: Date | null };
    const interactionsByCm = new Map<string, InteractionStats>();
    for (const it of (interactionsResult.data ?? []) as Array<{ cm_id: string; created_at: string }>) {
      let stats = interactionsByCm.get(it.cm_id);
      if (!stats) {
        stats = { count7d: 0, lastAt: null };
        interactionsByCm.set(it.cm_id, stats);
      }
      stats.count7d += 1;
      const at = new Date(it.created_at);
      if (!stats.lastAt || at > stats.lastAt) stats.lastAt = at;
    }

    const absenceByCm = new Map<string, { absenceType: string; startsOn: string; endsOn: string; backupCmName: string | null }>();
    const teamMembers = (teamResult.data ?? []) as Array<{ id: string; name: string }>;
    const teamNameById = new Map(teamMembers.map((m) => [m.id, m.name]));
    for (const abs of (absencesResult.data ?? []) as Array<{
      cm_id: string;
      absence_type: string;
      starts_on: string;
      ends_on: string;
      backup_cm_id: string | null;
    }>) {
      absenceByCm.set(abs.cm_id, {
        absenceType: abs.absence_type,
        startsOn: abs.starts_on,
        endsOn: abs.ends_on,
        backupCmName: abs.backup_cm_id ? teamNameById.get(abs.backup_cm_id) ?? null : null,
      });
    }

    const customersByCm = new Map<string, CustomerRow[]>();
    for (const a of (assignmentsResult.data ?? []) as Array<{ customer_id: string; cm_id: string | null }>) {
      if (!a.cm_id) continue;
      const c = customerById.get(a.customer_id);
      if (!c) continue;
      let list = customersByCm.get(a.cm_id);
      if (!list) {
        list = [];
        customersByCm.set(a.cm_id, list);
      }
      list.push(c);
    }

    const REQUIREMENTS: Record<number, { min: number; goal: number }> = {
      1: { min: 3, goal: 7 },
      2: { min: 3, goal: 6 },
      3: { min: 3, goal: 5 },
      4: { min: 2, goal: 4 },
      5: { min: 2, goal: 4 },
    };

    const cmPulse = teamMembers.map((member) => {
      const cmId = member.id;
      const memberCustomers = customersByCm.get(cmId) ?? [];
      const interactionStats = interactionsByCm.get(cmId);
      const lastInteractionAt = interactionStats?.lastAt ?? null;
      const lastInteractionDays = lastInteractionAt
        ? Math.max(0, Math.floor((+today - +lastInteractionAt) / 86_400_000))
        : 999;

      const enrichedCustomers = memberCustomers.map((c) => {
        const stats = conceptsByCustomer.get(c.id) ?? {
          planned: 0,
          overdue7d: 0,
          latestPlanned: null,
          lastPublished: null,
        };
        const pace = (Math.min(5, Math.max(1, c.concepts_per_week ?? c.expected_concepts_per_week ?? 1)) as 1 | 2 | 3 | 4 | 5);
        const pausedUntil = c.paused_until ? new Date(c.paused_until) : null;
        const days = stats.latestPlanned
          ? Math.max(0, Math.floor((+stats.latestPlanned - +today) / 86_400_000))
          : 0;
        const req = REQUIREMENTS[pace];
        let bufferStatus: 'ok' | 'thin' | 'under' | 'paused' | 'blocked';
        if (pausedUntil && pausedUntil > today) bufferStatus = 'paused';
        else if (stats.overdue7d > 0) bufferStatus = 'blocked';
        else if (days >= req.goal) bufferStatus = 'ok';
        else if (days >= req.min) bufferStatus = 'thin';
        else bufferStatus = 'under';

        return {
          id: c.id,
          name: c.business_name ?? '',
          bufferStatus,
          pace,
          onboardingState: (c.onboarding_state ?? 'live') as 'invited' | 'cm_ready' | 'live' | 'settled',
          lastPublishedAt: stats.lastPublished,
          plannedConceptsCount: stats.planned,
          overdue7dConceptsCount: stats.overdue7d,
        };
      });

      const active = enrichedCustomers.filter((c) => c.bufferStatus !== 'paused');
      const n_blocked = active.filter((c) => c.overdue7dConceptsCount > 0 || c.bufferStatus === 'blocked').length;
      const n_under = active.filter(
        (c) => c.plannedConceptsCount < c.pace && !(c.overdue7dConceptsCount > 0 || c.bufferStatus === 'blocked'),
      ).length;
      const n_thin = active.filter(
        (c) =>
          c.plannedConceptsCount >= c.pace &&
          c.bufferStatus !== 'ok' &&
          !(c.overdue7dConceptsCount > 0 || c.bufferStatus === 'blocked'),
      ).length;
      const n_ok = active.length - n_under - n_blocked - n_thin;
      const n_paused = enrichedCustomers.length - active.length;

      const planned_concepts_total = active.reduce(
        (sum, c) => sum + Math.min(c.plannedConceptsCount, c.pace),
        0,
      );
      const expected_concepts_7d = active.reduce((sum, c) => sum + c.pace, 0);

      const activeAbsence = absenceByCm.get(cmId) ?? null;

      let status: 'away' | 'ok' | 'watch' | 'needs_action';
      if (activeAbsence) status = 'away';
      else if (
        lastInteractionDays >= 5 ||
        n_under >= 2 ||
        (expected_concepts_7d > 0 && planned_concepts_total < expected_concepts_7d * 0.5)
      )
        status = 'needs_action';
      else if (
        n_under === 1 ||
        n_thin >= 2 ||
        lastInteractionDays >= 3 ||
        (expected_concepts_7d > 0 && planned_concepts_total < expected_concepts_7d)
      )
        status = 'watch';
      else status = 'ok';

      const fillPct =
        expected_concepts_7d === 0
          ? 100
          : Math.min(150, Math.round((planned_concepts_total / expected_concepts_7d) * 100));

      const recentPublications = [...enrichedCustomers]
        .filter((c) => c.lastPublishedAt)
        .sort((a, b) => +(b.lastPublishedAt as Date) - +(a.lastPublishedAt as Date))
        .slice(0, 3);

      const newCustomers = enrichedCustomers.filter(
        (c) => c.onboardingState === 'invited' || c.onboardingState === 'cm_ready',
      );

      return {
        member: {
          id: cmId,
          name: (member as { name: string }).name,
          email: (member as unknown as { email: string }).email,
          avatar_url: (member as unknown as { avatar_url: string | null }).avatar_url ?? null,
          created_at: (member as unknown as { created_at: string | null }).created_at ?? null,
        },
        aggregate: {
          cmId,
          status,
          activeAbsence,
          counts: { n_under, n_thin, n_blocked, n_ok, n_paused },
          totalCustomers: enrichedCustomers.length,
          lastInteractionAt,
          last_interaction_days: lastInteractionDays,
          planned_concepts_total,
          expected_concepts_7d,
          fillPct,
          overflow: fillPct > 100,
          barLabel: `${planned_concepts_total}/${expected_concepts_7d} koncept`,
          interaction_count_7d: interactionStats?.count7d ?? 0,
          newCustomers,
          recentPublications,
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
