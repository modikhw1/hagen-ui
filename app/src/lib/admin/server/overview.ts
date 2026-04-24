import 'server-only';

import { formatDateOnly } from '@/lib/admin/billing-periods';
import { overviewCopy } from '@/lib/admin/copy/overview';
import { getLatestAdminAttentionSeenAt } from '@/lib/admin/events';
import { formatSek } from '@/lib/admin/money';
import { aggregateOverviewCosts } from '@/lib/admin/overview-costs';
import { 
  deriveOverview, 
  monthlyRevenueCard, 
  activeCustomersCard, 
  demosCard, 
  costsCard 
} from '@/lib/admin/overview-derive';
import type { OverviewDerivedPayload, OverviewPayload } from '@/lib/admin/overview-types';
import { isMissingRelationError } from '@/lib/admin/schema-guards';
import { listScheduledAssignmentChanges } from '@/lib/admin/cm-assignments';
import { listCmAbsences } from '@/lib/admin/cm-absences';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { unstable_cache } from 'next/cache';

export type SortMode = 'standard' | 'lowest_activity';

export type MetricsSection = {
  metrics: OverviewDerivedPayload['metrics'];
};

export type CmPulseSection = {
  cmPulse: OverviewDerivedPayload['cmPulse'];
};

export type AttentionSection = {
  attentionItems: OverviewDerivedPayload['attentionItems'];
  snoozedAttentionItems: OverviewDerivedPayload['snoozedAttentionItems'];
  snoozedCount: number;
  attentionFeedSeenAt: string | null;
};

export type CostsSection = OverviewDerivedPayload['costs'];

export type ServiceCostsResult = {
  entries: CostsSection['entries'];
  totalOre: number;
};

type SubscriptionSummaryRow = {
  mrr_now_ore: number | string | null;
  mrr_30d_ago_ore: number | string | null;
};

type SubscriptionRow = {
  status: string | null;
  amount: number | null;
  created: string | null;
  canceled_at: string | null;
};

type CustomerMetricsRow = {
  id: string;
  status: string | null;
  paused_until: string | null;
  agreed_at: string | null;
  created_at: string | null;
};

function toSafeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeOnboardingState(
  value: unknown,
): OverviewPayload['customers'][number]['onboarding_state'] {
  return value === 'invited' ||
    value === 'cm_ready' ||
    value === 'live' ||
    value === 'settled'
    ? value
    : null;
}

function formatSignedOre(deltaOre: number) {
  const sign = deltaOre >= 0 ? '+' : '-';
  return `${sign}${formatSek(Math.abs(deltaOre), { fallback: '0 kr' })}`;
}

async function loadServiceCostsFromSql(supabase = createSupabaseAdmin()): Promise<ServiceCostsResult> {
  const viewResult = await (
    ((supabase.from('v_admin_service_costs_30d' as never) as unknown) as {
      select: (columns: string) => Promise<{
        data: Array<{
          service: string | null;
          calls_30d: number | string | null;
          cost_30d: number | string | null;
          trend: unknown;
        }> | null;
        error: { message?: string } | null;
      }>;
    })
  ).select('service, calls_30d, cost_30d, trend');

  if (viewResult.error) {
    if (!isMissingRelationError(viewResult.error.message)) {
      throw new Error(viewResult.error.message || overviewCopy.loadCostsError);
    }

    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const fallbackResult = await supabase
      .from('service_costs')
      .select('service, date, calls, cost_sek')
      .gte('date', cutoff);
    if (fallbackResult.error) {
      throw new Error(fallbackResult.error.message || overviewCopy.loadCostsError);
    }

    return aggregateOverviewCosts(fallbackResult.data ?? []);
  }

  const entries = (viewResult.data ?? []).map((row) => ({
    service: row.service ?? overviewCopy.unknownName,
    calls_30d: toSafeNumber(row.calls_30d),
    cost_30d: toSafeNumber(row.cost_30d),
    trend: Array.isArray(row.trend)
      ? row.trend.map((item) => toSafeNumber(item))
      : [],
  }));

  return {
    entries,
    totalOre: entries.reduce((sum, entry) => sum + entry.cost_30d, 0),
  };
}

async function loadSubscriptionSummary(supabase = createSupabaseAdmin()) {
  const summaryResult = await (
    ((supabase.from('v_admin_subscription_summary' as never) as unknown) as {
      select: (columns: string) => {
        limit: (count: number) => {
          maybeSingle: () => Promise<{
            data: SubscriptionSummaryRow | null;
            error: { message?: string } | null;
          }>;
        };
      };
    })
  )
    .select('mrr_now_ore, mrr_30d_ago_ore')
    .limit(1)
    .maybeSingle();

  if (summaryResult.error && !isMissingRelationError(summaryResult.error.message)) {
    throw new Error(summaryResult.error.message || overviewCopy.loadSubscriptionsError);
  }

  if (summaryResult.data) {
    return {
      mrrNowOre: toSafeNumber(summaryResult.data.mrr_now_ore),
      mrr30dAgoOre: toSafeNumber(summaryResult.data.mrr_30d_ago_ore),
    };
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const subscriptionsResult = await supabase
    .from('v_admin_subscriptions')
    .select('status, amount, created, canceled_at')
    .order('created', { ascending: false })
    .limit(200);

  if (subscriptionsResult.error) {
    throw new Error(subscriptionsResult.error.message || overviewCopy.loadSubscriptionsError);
  }

  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionRow[];
  const mrrNowOre = subscriptions
    .filter((subscription) =>
      ['active', 'trialing', 'past_due'].includes(subscription.status ?? ''),
    )
    .filter((subscription) => {
      const canceledAt = parseIsoDate(subscription.canceled_at);
      return !canceledAt || canceledAt > now;
    })
    .reduce((sum, subscription) => sum + toSafeNumber(subscription.amount), 0);
  const mrr30dAgoOre = subscriptions
    .filter((subscription) =>
      ['active', 'trialing', 'past_due'].includes(subscription.status ?? ''),
    )
    .filter((subscription) => {
      const createdAt = parseIsoDate(subscription.created);
      const canceledAt = parseIsoDate(subscription.canceled_at);
      if (!createdAt || createdAt > thirtyDaysAgo) {
        return false;
      }
      return !canceledAt || canceledAt > thirtyDaysAgo;
    })
    .reduce((sum, subscription) => sum + toSafeNumber(subscription.amount), 0);

  return { mrrNowOre, mrr30dAgoOre };
}

function mapCustomersForOverview(
  rows: Array<{
    id: string;
    business_name: string | null;
    account_manager: string | null;
    account_manager_profile_id: string | null;
    monthly_price: number | null;
    status: string | null;
    created_at: string | null;
    agreed_at: string | null;
    last_upload_at: string | null;
    concepts_per_week: number | null;
    expected_concepts_per_week: number | null;
    paused_until: string | null;
    onboarding_state: string | null;
    onboarding_state_changed_at: string | null;
    tiktok_handle: string | null;
  }>,
): OverviewPayload['customers'] {
  return rows.map((customer) => ({
    id: customer.id,
    business_name: customer.business_name ?? '',
    account_manager: customer.account_manager ?? null,
    account_manager_profile_id: customer.account_manager_profile_id ?? null,
    monthly_price: customer.monthly_price ?? null,
    status: customer.status ?? null,
    created_at: customer.created_at ?? null,
    agreed_at: customer.agreed_at ?? null,
    last_upload_at: customer.last_upload_at ?? null,
    upload_schedule: null,
    concepts_per_week: customer.concepts_per_week ?? null,
    expected_concepts_per_week: customer.expected_concepts_per_week ?? null,
    paused_until: customer.paused_until ?? null,
    onboarding_state: normalizeOnboardingState(customer.onboarding_state),
    onboarding_state_changed_at: customer.onboarding_state_changed_at ?? null,
    tiktok_handle: customer.tiktok_handle ?? null,
  }));
}

export type BaseOverviewData = {
  customers: OverviewPayload['customers'];
  team: OverviewPayload['team'];
  interactions: OverviewPayload['interactions'];
  bufferRows: OverviewPayload['bufferRows'];
  absences: unknown[];
};

async function loadCmPulseBase(supabase = createSupabaseAdmin()): Promise<BaseOverviewData> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  
  // Consolidate customers and buffer into a single unified query
  const [unifiedResult, teamResult, interactionsResult, absences] =
    await Promise.all([
      supabase
        .from('v_admin_customer_list' as any)
        .select('*'),
      supabase
        .from('team_members')
        .select('id, name, email, color, profile_id, avatar_url')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('cm_interactions')
        .select('cm_id, customer_id, type, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500),
      listCmAbsences(supabase, { limit: 200 }),
    ]);

  if (unifiedResult.error) throw new Error(unifiedResult.error.message || overviewCopy.loadCustomersError);
  if (teamResult.error) throw new Error(teamResult.error.message || overviewCopy.loadTeamError);
  if (interactionsResult.error) throw new Error(interactionsResult.error.message || overviewCopy.loadInteractionsError);

  const unifiedRows = (unifiedResult.data ?? []) as any[];

  return {
    customers: mapCustomersForOverview(unifiedRows),
    team: (teamResult.data ?? []).map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email ?? null,
      color: member.color ?? null,
      profile_id: member.profile_id ?? null,
      avatar_url: member.avatar_url ?? null,
    })),
    interactions: (interactionsResult.data ?? []).map((interaction) => ({
      cm_id: interaction.cm_id ?? null,
      customer_id: interaction.customer_id ?? null,
      type: interaction.type ?? null,
      created_at: interaction.created_at ?? null,
    })),
    bufferRows: unifiedRows.map((row) => ({
      customer_id: row.id,
      assigned_cm_id: row.account_manager_profile_id ?? null,
      concepts_per_week: row.concepts_per_week ?? null,
      paused_until: row.paused_until ?? null,
      latest_planned_publish_date: row.latest_planned_publish_date ?? null,
      last_published_at: row.last_published_at ?? null,
    })),
    absences,
  };
}

export const loadCmPulseBaseCached = () => unstable_cache(
  async () => loadCmPulseBase(),
  ['admin-overview-pulse-base'],
  { revalidate: 30, tags: ['admin:overview:base'] }
)();

export async function loadAdminOverviewCosts(): Promise<ServiceCostsResult> {
  const supabase = createSupabaseAdmin();
  return loadServiceCostsFromSql(supabase);
}

export async function loadOverviewMetricsSection(options: { 
  supabase?: ReturnType<typeof createSupabaseAdmin>,
  baseData?: BaseOverviewData 
} = {}): Promise<MetricsSection> {
  const supabase = options.supabase ?? createSupabaseAdmin();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  
  const [sentCountResult, convertedCountResult, costsResult, summary] =
    await Promise.all([
      supabase
        .from('demos')
        .select('id', { count: 'exact', head: true })
        .in('status', ['sent', 'opened', 'responded', 'won', 'lost'])
        .gte('status_changed_at', since),
      supabase
        .from('demos')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'won')
        .gte('resolved_at', since),
      loadServiceCostsFromSql(supabase),
      loadSubscriptionSummary(supabase),
    ]);

  if (sentCountResult.error || convertedCountResult.error) {
    throw new Error(
      sentCountResult.error?.message ||
        convertedCountResult.error?.message ||
        overviewCopy.loadDemosError,
    );
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 86_400_000);
  
  let normalizedCustomers: Array<{
    normalizedStatus: 'active' | 'churned' | 'paused';
    activatedAt: Date | null;
    churnedAt: Date | null;
  }> = [];

  if (options.baseData) {
    normalizedCustomers = options.baseData.customers.map((customer) => ({
      normalizedStatus:
        customer.status === 'archived'
          ? 'churned'
          : customer.paused_until
            ? 'paused'
            : 'active',
      activatedAt:
        customer.status === 'active' || customer.status === 'agreed'
          ? parseIsoDate(customer.agreed_at ?? customer.created_at)
          : null,
      churnedAt:
        customer.status === 'archived'
          ? parseIsoDate(customer.created_at)
          : null,
    }));
  } else {
    const { data: customers, error: customersError } = await supabase
      .from('customer_profiles')
      .select('id, status, paused_until, agreed_at, created_at');
    
    if (customersError) {
      throw new Error(customersError.message || overviewCopy.loadCustomersError);
    }

    normalizedCustomers = (customers as CustomerMetricsRow[]).map((customer) => ({
      normalizedStatus:
        customer.status === 'archived'
          ? 'churned'
          : customer.paused_until
            ? 'paused'
            : 'active',
      activatedAt:
        customer.status === 'active' || customer.status === 'agreed'
          ? parseIsoDate(customer.agreed_at ?? customer.created_at)
          : null,
      churnedAt:
        customer.status === 'archived'
          ? parseIsoDate(customer.created_at)
          : null,
    }));
  }

  const activeCount = normalizedCustomers.filter(
    (customer) => customer.normalizedStatus === 'active',
  ).length;
  const newWithin = normalizedCustomers.filter(
    (customer) => customer.activatedAt && customer.activatedAt >= cutoff,
  ).length;
  const churnedWithin = normalizedCustomers.filter(
    (customer) => customer.churnedAt && customer.churnedAt >= cutoff,
  ).length;
  const net = newWithin - churnedWithin;

  const mrrDeltaOre = summary.mrrNowOre - summary.mrr30dAgoOre;

  return {
    metrics: {
      revenueCard: {
        label: 'Månatliga intäkter',
        value: formatSek(summary.mrrNowOre, { fallback: '0 kr' }),
        delta: { 
          text: formatSignedOre(mrrDeltaOre), 
          tone: mrrDeltaOre > 0 ? 'success' : mrrDeltaOre < 0 ? 'destructive' : 'muted' 
        },
        sub: '30d',
      },
      activeCard: {
        label: 'Aktiva kunder',
        value: String(activeCount),
        delta:
          net === 0
            ? undefined
            : {
                text: `(${net > 0 ? '+' : ''}${net})`,
                tone: net > 0 ? 'success' : 'destructive',
              },
        sub: '30d',
      },
      demosCard: {
        label: 'Demos skickade',
        value: String(sentCountResult.count ?? 0),
        sub: `${convertedCountResult.count ?? 0} konverterade`,
      },
      costsCard: {
        label: 'Kostnad 30d',
        value: formatSek(costsResult.totalOre, { fallback: '0 kr' }),
        sub: '30d',
      },
    },
  };
}

export async function loadOverviewCmPulseSection(params: {
  sortMode: SortMode;
  baseData?: BaseOverviewData;
}): Promise<CmPulseSection> {
  const [base] = await Promise.all([
    params.baseData ? Promise.resolve(params.baseData) : loadCmPulseBaseCached(),
  ]);
  const payload: OverviewPayload = {
    customers: base.customers,
    team: base.team,
    interactions: base.interactions,
    bufferRows: base.bufferRows,
    invoices: [],
    scheduledAssignmentChanges: [],
    subscriptions: [],
    billingHealth: null,
    serviceCosts: { entries: [], totalOre: 0 },
    demos: { sent: 0, converted: 0, demos: [] },
    cmNotifications: [],
    attentionSnoozes: [],
    absences: base.absences as any,
    attentionFeedSeenAt: null,
  };

  const derived = deriveOverview(payload, { sortMode: params.sortMode });
  return {
    cmPulse: derived.cmPulse,
  };
}

export async function loadOverviewAttentionSection(params: {
  sortMode: SortMode;
  userId: string;
  baseData?: BaseOverviewData;
}): Promise<AttentionSection> {
  const supabase = createSupabaseAdmin();
  const today = formatDateOnly(new Date());

  const [
    base,
    cmNotificationsResult,
    attentionSnoozesResult,
    invoicesResult,
    scheduledAssignmentChanges,
    demosResult,
    attentionFeedSeenAt,
  ] = await Promise.all([
    params.baseData ? Promise.resolve(params.baseData) : loadCmPulseBaseCached(),
    supabase
      .from('cm_notifications')
      .select('id, from_cm_id, customer_id, message, priority, created_at, resolved_at')
      .is('resolved_at', null),
    supabase
      .from('attention_snoozes')
      .select('subject_type, subject_id, snoozed_until, released_at'),
    supabase
      .from('invoices')
      .select('id, stripe_invoice_id, customer_profile_id, amount_due, due_date, status')
      .eq('status', 'open')
      .lt('due_date', today)
      .order('due_date', { ascending: true })
      .limit(500),
    listScheduledAssignmentChanges(supabase),
    supabase
      .from('demos')
      .select('id, company_name, status, status_changed_at, responded_at, resolved_at')
      .eq('status', 'responded')
      .order('responded_at', { ascending: false })
      .limit(200),
    getLatestAdminAttentionSeenAt(supabase, params.userId),
  ]);

  if (cmNotificationsResult.error) throw new Error(cmNotificationsResult.error.message || overviewCopy.loadNotificationsError);
  if (attentionSnoozesResult.error) throw new Error(attentionSnoozesResult.error.message || overviewCopy.loadSnoozesError);
  if (invoicesResult.error) throw new Error(invoicesResult.error.message || overviewCopy.loadInvoicesError);
  if (demosResult.error) throw new Error(demosResult.error.message || overviewCopy.loadDemosError);

  const payload: OverviewPayload = {
    customers: base.customers,
    team: base.team,
    interactions: base.interactions,
    bufferRows: base.bufferRows,
    invoices: (invoicesResult.data ?? []).map((invoice) => ({
      id: invoice.id,
      stripe_invoice_id: invoice.stripe_invoice_id ?? null,
      customer_id: invoice.customer_profile_id ?? undefined,
      amount_due: invoice.amount_due ?? 0,
      due_date: invoice.due_date ?? null,
      status: invoice.status ?? '',
    })),
    scheduledAssignmentChanges,
    subscriptions: [],
    billingHealth: null,
    serviceCosts: { entries: [], totalOre: 0 },
    demos: {
      sent: 0,
      converted: 0,
      demos: (demosResult.data ?? []).map((demo) => ({
        id: demo.id,
        company_name: demo.company_name,
        contact_name: null,
        contact_email: null,
        tiktok_handle: null,
        proposed_concepts_per_week: null,
        proposed_price_ore: null,
        status: demo.status,
        status_changed_at: demo.status_changed_at,
        responded_at: demo.responded_at ?? null,
        resolved_at: demo.resolved_at ?? null,
        owner_admin_id: null,
      })),
    },
    cmNotifications: (cmNotificationsResult.data ?? []).map((notification) => ({
      id: notification.id,
      from_cm_id: notification.from_cm_id,
      customer_id: notification.customer_id ?? null,
      message: notification.message,
      priority: notification.priority,
      created_at: notification.created_at,
      resolved_at: notification.resolved_at ?? null,
    })),
    attentionSnoozes: (attentionSnoozesResult.data ?? []).map((snooze) => ({
      subject_type: snooze.subject_type,
      subject_id: snooze.subject_id,
      snoozed_until: snooze.snoozed_until,
      released_at: snooze.released_at,
    })),
    absences: base.absences as any,
    attentionFeedSeenAt,
  };

  const derived = deriveOverview(payload, { sortMode: params.sortMode });
  return {
    attentionItems: derived.attentionItems,
    snoozedAttentionItems: derived.snoozedAttentionItems,
    snoozedCount: derived.snoozedAttentionItems.length,
    attentionFeedSeenAt: attentionFeedSeenAt ?? null,
  };
}

export async function loadAdminOverview(params: {
  sortMode: SortMode;
  userId: string;
}) {
  const supabase = createSupabaseAdmin();
  const today = formatDateOnly(new Date());
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  
  // Single massive parallel block - zero sequential awaits
  const [
    baseData,
    sentCountResult,
    convertedCountResult,
    costsResult,
    summary,
    cmNotificationsResult,
    attentionSnoozesResult,
    invoicesResult,
    scheduledAssignmentChanges,
    demosResult,
    attentionFeedSeenAt
  ] = await Promise.all([
    loadCmPulseBaseCached(),
    supabase
      .from('demos')
      .select('id', { count: 'exact', head: true })
      .in('status', ['sent', 'opened', 'responded', 'won', 'lost'])
      .gte('status_changed_at', since),
    supabase
      .from('demos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'won')
      .gte('resolved_at', since),
    loadServiceCostsFromSql(supabase),
    loadSubscriptionSummary(supabase),
    supabase
      .from('cm_notifications')
      .select('id, from_cm_id, customer_id, message, priority, created_at, resolved_at')
      .is('resolved_at', null),
    supabase
      .from('attention_snoozes')
      .select('subject_type, subject_id, snoozed_until, released_at'),
    supabase
      .from('invoices')
      .select('id, stripe_invoice_id, customer_profile_id, amount_due, due_date, status')
      .eq('status', 'open')
      .lt('due_date', today)
      .order('due_date', { ascending: true })
      .limit(500),
    listScheduledAssignmentChanges(supabase),
    supabase
      .from('demos')
      .select('id, company_name, status, status_changed_at, responded_at, resolved_at')
      .eq('status', 'responded')
      .order('responded_at', { ascending: false })
      .limit(200),
    getLatestAdminAttentionSeenAt(supabase, params.userId),
  ]);

  const metrics = processMetricsSection({ baseData, sentCountResult, convertedCountResult, costsResult, summary });
  const cmPulse = processCmPulseSection({ baseData, sortMode: params.sortMode });
  const attention = processAttentionSection({ 
    baseData, 
    cmNotificationsResult, 
    attentionSnoozesResult, 
    invoicesResult, 
    scheduledAssignmentChanges, 
    demosResult, 
    attentionFeedSeenAt,
    sortMode: params.sortMode 
  });

  return {
    metrics,
    cmPulse,
    topAttention: attention.attentionItems.slice(0, 3),
    attentionItems: attention.attentionItems,
    snoozedAttentionItems: attention.snoozedAttentionItems,
    snoozedCount: attention.snoozedCount,
    costs: costsResult,
    attentionFeedSeenAt: attention.attentionFeedSeenAt,
  };
}

function processMetricsSection(params: {
  baseData: BaseOverviewData;
  sentCountResult: any;
  convertedCountResult: any;
  costsResult: ServiceCostsResult;
  summary: any;
}): MetricsSection['metrics'] {
  const { baseData, sentCountResult, convertedCountResult, costsResult, summary } = params;
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 86_400_000);
  
  const normalizedCustomers = baseData.customers.map((customer) => ({
    normalizedStatus:
      customer.status === 'archived' ? 'churned' : customer.paused_until ? 'paused' : 'active',
    activatedAt:
      customer.status === 'active' || customer.status === 'agreed'
        ? parseIsoDate(customer.agreed_at ?? customer.created_at)
        : null,
    churnedAt:
      customer.status === 'archived' ? parseIsoDate(customer.created_at) : null,
  }));

  const activeCount = normalizedCustomers.filter((c) => c.normalizedStatus === 'active').length;
  const newWithin = normalizedCustomers.filter((c) => c.activatedAt && c.activatedAt >= cutoff).length;
  const churnedWithin = normalizedCustomers.filter((c) => c.churnedAt && c.churnedAt >= cutoff).length;
  const net = newWithin - churnedWithin;
  const mrrDeltaOre = summary.mrrNowOre - summary.mrr30dAgoOre;

  return {
    revenueCard: {
      label: 'Månatliga intäkter',
      value: formatSek(summary.mrrNowOre, { fallback: '0 kr' }),
      delta: { 
        text: formatSignedOre(mrrDeltaOre), 
        tone: mrrDeltaOre > 0 ? 'success' : mrrDeltaOre < 0 ? 'destructive' : 'muted' 
      },
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
      value: String(sentCountResult.count ?? 0),
      sub: `${convertedCountResult.count ?? 0} konverterade`,
    },
    costsCard: {
      label: 'Kostnad 30d',
      value: formatSek(costsResult.totalOre, { fallback: '0 kr' }),
      sub: '30d',
    },
  };
}

function processCmPulseSection(params: {
  baseData: BaseOverviewData;
  sortMode: SortMode;
}): CmPulseSection['cmPulse'] {
  const { baseData, sortMode } = params;
  const payload: OverviewPayload = {
    customers: baseData.customers,
    team: baseData.team,
    interactions: baseData.interactions,
    bufferRows: baseData.bufferRows,
    invoices: [],
    scheduledAssignmentChanges: [],
    subscriptions: [],
    billingHealth: null,
    serviceCosts: { entries: [], totalOre: 0 },
    demos: { sent: 0, converted: 0, demos: [] },
    cmNotifications: [],
    attentionSnoozes: [],
    absences: baseData.absences as any,
    attentionFeedSeenAt: null,
  };
  return deriveOverview(payload, { sortMode }).cmPulse;
}

function processAttentionSection(params: {
  baseData: BaseOverviewData;
  cmNotificationsResult: any;
  attentionSnoozesResult: any;
  invoicesResult: any;
  scheduledAssignmentChanges: any;
  demosResult: any;
  attentionFeedSeenAt: string | null;
  sortMode: SortMode;
}): AttentionSection {
  const { baseData, cmNotificationsResult, attentionSnoozesResult, invoicesResult, scheduledAssignmentChanges, demosResult, attentionFeedSeenAt, sortMode } = params;
  const payload: OverviewPayload = {
    customers: baseData.customers,
    team: baseData.team,
    interactions: baseData.interactions,
    bufferRows: baseData.bufferRows,
    invoices: (invoicesResult.data ?? []).map((invoice: any) => ({
      id: invoice.id,
      stripe_invoice_id: invoice.stripe_invoice_id ?? null,
      customer_id: invoice.customer_profile_id ?? undefined,
      amount_due: invoice.amount_due ?? 0,
      due_date: invoice.due_date ?? null,
      status: invoice.status ?? '',
    })),
    scheduledAssignmentChanges,
    subscriptions: [],
    billingHealth: null,
    serviceCosts: { entries: [], totalOre: 0 },
    demos: {
      sent: 0,
      converted: 0,
      demos: (demosResult.data ?? []).map((demo: any) => ({
        id: demo.id,
        company_name: demo.company_name,
        contact_name: null,
        contact_email: null,
        tiktok_handle: null,
        proposed_concepts_per_week: null,
        proposed_price_ore: null,
        status: demo.status,
        status_changed_at: demo.status_changed_at,
        responded_at: demo.responded_at ?? null,
        resolved_at: demo.resolved_at ?? null,
        owner_admin_id: null,
      })),
    },
    cmNotifications: (cmNotificationsResult.data ?? []).map((notification: any) => ({
      id: notification.id,
      from_cm_id: notification.from_cm_id,
      customer_id: notification.customer_id ?? null,
      message: notification.message,
      priority: notification.priority,
      created_at: notification.created_at,
      resolved_at: notification.resolved_at ?? null,
    })),
    attentionSnoozes: (attentionSnoozesResult.data ?? []).map((snooze: any) => ({
      subject_type: snooze.subject_type,
      subject_id: snooze.subject_id,
      snoozed_until: snooze.snoozed_until,
      released_at: snooze.released_at,
    })),
    absences: baseData.absences as any,
    attentionFeedSeenAt,
  };

  const derived = deriveOverview(payload, { sortMode });
  return {
    attentionItems: derived.attentionItems,
    snoozedAttentionItems: derived.snoozedAttentionItems,
    snoozedCount: derived.snoozedAttentionItems.length,
    attentionFeedSeenAt: attentionFeedSeenAt ?? null,
  };
}
