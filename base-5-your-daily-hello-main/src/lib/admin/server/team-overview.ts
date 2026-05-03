
import { formatDateOnly } from '@/lib/admin/billing-periods';
import type { TeamMemberView } from '@/lib/admin/dtos/team';
import {
  findActiveCmAbsence,
  resolveEffectiveCustomerCoverage,
  type EnrichedCmAbsence,
} from '@/lib/admin/server/coverage';
import {
  baseline90d,
  classifyDay,
  summarize,
  type DailyDot,
} from '@/lib/admin/server/team-flow';

export const MAX_CUSTOMERS_PER_CM = 12;
const USE_LEGACY_AM_MATCH = process.env.USE_LEGACY_AM_MATCH !== '0';
const USE_LEGACY_ACTIVITY_MATCH = process.env.USE_LEGACY_ACTIVITY_MATCH !== '0';

type TeamMemberRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_active: boolean;
  profile_id: string | null;
  bio: string | null;
  city: string | null;
  avatar_url: string | null;
  commission_rate: number | null;
  customer_count?: number | null;
  mrr_ore?: number | null;
  customer_load_level?: 'ok' | 'warn' | 'overload' | null;
  customer_load_label?: string | null;
  overloaded?: boolean | null;
};

type CustomerRow = {
  id: string;
  business_name: string;
  monthly_price: number | null;
  status: string;
  paused_until?: string | null;
  account_manager_profile_id: string | null;
  account_manager: string | null;
  last_upload_at: string | null;
  last_published_at?: string | null;
  last_publication_source?: 'letrend' | 'tiktok' | null;
  planned_concepts_count?: number | null;
  expected_concepts_per_week?: number | null;
  overdue_7d_concepts_count?: number | null;
};

type ActivityRow = {
  cm_id: string | null;
  cm_email: string | null;
  type: string | null;
  created_at: string;
};

type AssignmentHistoryRow = {
  id: string;
  customer_id: string;
  cm_id: string | null;
  valid_from: string;
  valid_to: string | null;
  handover_note: string | null;
  scheduled_change: Record<string, unknown> | null;
};

type EffectiveCustomer = CustomerRow & {
  primary_cm_id: string | null;
  effective_cm_id: string | null;
  payout_cm_id: string | null;
  covered_by_absence: boolean;
};

type ActivityIndex = {
  byCmId: Map<string, ActivityRow[]>;
  byIdentity: Map<string, ActivityRow[]>;
};

type TeamOverviewBuildWarnings = Set<string>;

type BuildMemberParams = {
  member: TeamMemberRow;
  effectiveCustomers: EffectiveCustomer[];
  byCustomer: Record<
    string,
    {
      followers: number;
      videos_last_7d: number;
      engagement_rate: number;
    }
  >;
  assignments: AssignmentHistoryRow[];
  customerNameById: Map<string, string>;
  activityIndex: ActivityIndex;
  today: string;
  todayDate: Date;
  absences: EnrichedCmAbsence[];
};

export type TeamOverviewResult = {
  members: TeamMemberView[];
  asOfDate: string;
  schemaWarnings: string[];
};

export function buildTeamOverview(params: {
  members: TeamMemberRow[];
  customers: CustomerRow[];
  activities: ActivityRow[];
  assignments: AssignmentHistoryRow[];
  absences: EnrichedCmAbsence[];
  byCustomer: Record<
    string,
    {
      followers: number;
      videos_last_7d: number;
      engagement_rate: number;
    }
  >;
  sortMode: 'standard' | 'anomalous';
}): TeamOverviewResult {
  const { members, customers, activities, assignments, absences, byCustomer, sortMode } = params;
  const warnings: TeamOverviewBuildWarnings = new Set();
  const todayDate = startOfDay(new Date());
  const today = formatDateOnly(todayDate);
  const customerNameById = new Map(customers.map((customer) => [customer.id, customer.business_name]));
  const activityIndex = indexActivities(activities);
  const effectiveCustomers = attachEffectiveCoverage({
    customers,
    members,
    absences,
    today,
    warnings,
  });

  const rows: TeamMemberView[] = [];

  for (const member of members) {
    try {
      rows.push(
        buildMemberOverview({
          member,
          effectiveCustomers,
          byCustomer,
          assignments,
          customerNameById,
          activityIndex,
          today,
          todayDate,
          absences,
        }),
      );
    } catch (error) {
      warnings.add('team-overview-degraded');
      warnings.add(`team-overview-member-skipped:${member.id}`);
      console.error('[admin.team-overview] failed to build member row', {
        member_id: member.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (rows.length !== members.length) {
    warnings.add('team-overview-degraded');
  }

  const maxActivity = Math.max(...rows.map((row) => row.activityCount), 1);
  const normalizedRows = rows.map((row) => ({
    ...row,
    activityRatio: row.activityCount / maxActivity,
  }));

  return {
    members: sortTeamRows(normalizedRows, sortMode),
    asOfDate: today,
    schemaWarnings: Array.from(warnings),
  };
}

export function attachEffectiveCoverage(params: {
  customers: CustomerRow[];
  members: TeamMemberRow[];
  absences: EnrichedCmAbsence[];
  today: string;
  warnings: TeamOverviewBuildWarnings;
}): EffectiveCustomer[] {
  const { customers, members, absences, today, warnings } = params;

  return customers.map((customer) => {
    const { member: primaryMember, usedLegacyMatch } = resolvePrimaryMember(customer, members);

    if (usedLegacyMatch && primaryMember) {
      warnings.add('team-overview-legacy-am-match');
      console.error('[admin.team-overview] legacy account manager fallback match', {
        customer_id: customer.id,
        account_manager: customer.account_manager,
        matched_cm_id: primaryMember.id,
      });
    }

    try {
      const coverage = resolveEffectiveCustomerCoverage({
        absences,
        customerId: customer.id,
        primaryCmId: primaryMember?.id ?? null,
        asOfDate: today,
      });

      return {
        ...customer,
        primary_cm_id: primaryMember?.id ?? null,
        effective_cm_id: coverage.responsibleCmId,
        payout_cm_id: coverage.payoutCmId,
        covered_by_absence: coverage.appliedAbsenceId !== null,
      };
    } catch (error) {
      warnings.add('team-overview-degraded');
      warnings.add(`team-overview-customer-coverage-failed:${customer.id}`);
      console.error('[admin.team-overview] failed to resolve customer coverage', {
        customer_id: customer.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        ...customer,
        primary_cm_id: primaryMember?.id ?? null,
        effective_cm_id: primaryMember?.id ?? null,
        payout_cm_id: primaryMember?.id ?? null,
        covered_by_absence: false,
      };
    }
  });
}

export function buildMemberPortfolio(params: {
  member: TeamMemberRow;
  effectiveCustomers: EffectiveCustomer[];
  byCustomer: Record<
    string,
    {
      followers: number;
      videos_last_7d: number;
      engagement_rate: number;
    }
  >;
}) {
  const memberCustomers = params.effectiveCustomers
    .filter((customer) => customer.effective_cm_id === params.member.id)
    .map((customer) => {
      const customerStats = params.byCustomer[customer.id];
      const monthlyPrice = customer.monthly_price ?? 0;

      return {
        id: customer.id,
        name: customer.business_name,
        business_name: customer.business_name,
        mrr_ore: Math.round(monthlyPrice * 100),
        monthly_price: monthlyPrice,
        status: customer.status,
        paused_until: customer.paused_until ?? null,
        followers: customerStats?.followers ?? 0,
        videos_last_7d: customerStats?.videos_last_7d ?? 0,
        engagement_rate: customerStats?.engagement_rate ?? 0,
        flow_score: flowScore(
          customerStats?.videos_last_7d ?? 0,
          customerStats?.engagement_rate ?? 0,
        ),
        last_upload_at: customer.last_upload_at,
        last_published_at: customer.last_published_at ?? null,
        last_publication_source: customer.last_publication_source ?? null,
        planned_concepts_count: customer.planned_concepts_count ?? 0,
        expected_concepts_per_week: customer.expected_concepts_per_week ?? 0,
        overdue_7d_concepts_count: customer.overdue_7d_concepts_count ?? 0,
        covered_by_absence: customer.covered_by_absence,
        payout_cm_id: customer.payout_cm_id,
      };
    });

  const activeCustomers = memberCustomers.filter((customer) =>
    ['active', 'agreed'].includes(customer.status),
  ).length;
  const pipelineCustomers = memberCustomers.filter((customer) =>
    ['pending', 'pending_payment', 'pending_invoice', 'invited'].includes(customer.status),
  ).length;
  const uploadingCustomers = memberCustomers.filter((customer) => customer.videos_last_7d > 0).length;
  const mrrOre = memberCustomers.reduce((sum, customer) => {
    const isCommissionable =
      ['active', 'agreed', 'pending_invoice', 'pending_payment'].includes(customer.status) &&
      !customer.paused_until;

    return sum + (isCommissionable ? Math.round(customer.monthly_price * 100) : 0);
  }, 0);

  return {
    memberCustomers,
    activeCustomers,
    pipelineCustomers,
    uploadingCustomers,
    mrrOre,
  };
}

export function buildMemberActivity(params: {
  member: TeamMemberRow;
  activityIndex: ActivityIndex;
  todayDate: Date;
}) {
  const memberActivities = collectMemberActivities(params.member, params.activityIndex);
  const dayBuckets = bucketActivitiesByDay(memberActivities);

  const activitySeries = buildActivitySeries(dayBuckets, params.todayDate, 14);
  const baselineSeries = buildBaselineSeries(dayBuckets, params.todayDate);
  const activityBaseline = baseline90d(baselineSeries);
  const activityCount = activitySeries.slice(-7).reduce((sum, count) => sum + count, 0);
  const activityAverage7d = activityCount / 7;
  const activityDeviation =
    activityBaseline <= 0
      ? activityAverage7d > 0
        ? 1
        : 0
      : Math.abs(activityAverage7d - activityBaseline) / activityBaseline;

  const activityDots: DailyDot[] = activitySeries.map((count, index) => {
    const date = addDays(params.todayDate, -(13 - index));
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const level = classifyDay(count, activityBaseline, isWeekend);

    return {
      date,
      count,
      level,
      intensity: toDotIntensity(level),
      isWeekend,
    };
  });

  return {
    activitySeries,
    activityDots,
    activitySummary: summarize(activityDots),
    activityBaseline,
    activityAverage7d,
    activityDeviation,
    activityCount,
  };
}

export function buildAssignmentHistory(params: {
  member: TeamMemberRow;
  assignments: AssignmentHistoryRow[];
  customerNameById: Map<string, string>;
}) {
  return params.assignments
    .filter((assignment) => assignment.cm_id === params.member.id)
    .map((assignment) => ({
      id: assignment.id,
      customer_id: assignment.customer_id,
      customer_name: params.customerNameById.get(assignment.customer_id) ?? 'Kund',
      starts_on: assignment.valid_from,
      ends_on: assignment.valid_to,
      valid_from: assignment.valid_from,
      valid_to: assignment.valid_to,
      handover_note: assignment.handover_note,
      scheduled_effective_date: extractScheduledEffectiveDate(assignment.scheduled_change),
    }))
    .sort(
      (left, right) =>
        right.valid_from.localeCompare(left.valid_from) ||
        left.customer_name.localeCompare(right.customer_name),
    );
}

export function classifyLoad(customerCount: number) {
  const loadPercent = Math.min(1, Math.max(0, customerCount / MAX_CUSTOMERS_PER_CM));

  if (loadPercent >= 0.92) {
    return {
      customerLoadLevel: 'overload' as const,
      customerLoadClass: 'overload' as const,
      customerLoadLabel: 'Överbelastad',
      overloaded: true,
      loadPercent,
    };
  }

  if (loadPercent >= 0.67) {
    return {
      customerLoadLevel: 'overload' as const,
      customerLoadClass: 'overload' as const,
      customerLoadLabel: 'Full portfölj',
      overloaded: false,
      loadPercent,
    };
  }

  if (loadPercent >= 0.25) {
    return {
      customerLoadLevel: 'warn' as const,
      customerLoadClass: 'warn' as const,
      customerLoadLabel: 'Balans',
      overloaded: false,
      loadPercent,
    };
  }

  return {
    customerLoadLevel: 'ok' as const,
    customerLoadClass: 'ok' as const,
    customerLoadLabel: 'Lätt portfölj',
    overloaded: false,
    loadPercent,
  };
}

function buildMemberOverview(params: BuildMemberParams): TeamMemberView {
  const portfolio = buildMemberPortfolio({
    member: params.member,
    effectiveCustomers: params.effectiveCustomers,
    byCustomer: params.byCustomer,
  });
  const activity = buildMemberActivity({
    member: params.member,
    activityIndex: params.activityIndex,
    todayDate: params.todayDate,
  });
  const assignmentHistory = buildAssignmentHistory({
    member: params.member,
    assignments: params.assignments,
    customerNameById: params.customerNameById,
  });
  const derivedLoad = classifyLoad(portfolio.memberCustomers.length);

  const isCovering = params.absences.some(
    (absence) => absence.backup_cm_id === params.member.id && 
                 absence.is_active && 
                 params.today >= absence.starts_on && 
                 params.today <= absence.ends_on
  );

  return {
    id: params.member.id,
    name: params.member.name,
    email: params.member.email ?? '',
    phone: params.member.phone,
    city: params.member.city,
    bio: params.member.bio,
    avatar_url: params.member.avatar_url,
    role: params.member.role ?? 'content_manager',
    is_active: params.member.is_active,
    commission_rate: Number.isFinite(Number(params.member.commission_rate))
      ? Number(params.member.commission_rate)
      : 0.2,
    active_absence: findActiveCmAbsence(params.absences, params.member.id, params.today),
    isCovering,
    pulse: {
      status: 'ok',
      fillPct: 0,
      barLabel: '0/0 koncept',
      plannedConceptsTotal: 0,
      expectedConcepts7d: 0,
      interactionCount7d: 0,
      lastInteractionDays: 999,
      counts: {
        n_under: 0,
        n_thin: 0,
        n_blocked: 0,
        n_ok: 0,
        n_paused: 0,
      },
    },
    customers: portfolio.memberCustomers,
    assignmentHistory,
    customerCount: params.member.customer_count ?? portfolio.memberCustomers.length,
    mrr_ore: params.member.mrr_ore ?? portfolio.mrrOre,
    activityCount: activity.activityCount,
    activeWorkflowSteps: [
      portfolio.activeCustomers > 0,
      portfolio.pipelineCustomers > 0,
      portfolio.uploadingCustomers > 0,
    ].filter(Boolean).length,
    activityRatio: 0,
    activitySeries: activity.activitySeries,
    activityDots: activity.activityDots,
    activitySummary: activity.activitySummary,
    activityBaseline: activity.activityBaseline,
    activityAverage7d: activity.activityAverage7d,
    activityDeviation: activity.activityDeviation,
    customerLoadLevel: params.member.customer_load_level ?? derivedLoad.customerLoadLevel,
    customerLoadClass: params.member.customer_load_level ?? derivedLoad.customerLoadClass,
    customerLoadLabel: params.member.customer_load_label ?? derivedLoad.customerLoadLabel,
    overloaded: params.member.overloaded ?? derivedLoad.overloaded,
  };
}

function resolvePrimaryMember(customer: CustomerRow, members: TeamMemberRow[]) {
  if (customer.account_manager_profile_id) {
    const byProfile = members.find((member) => member.profile_id === customer.account_manager_profile_id);
    if (byProfile) {
      return { member: byProfile, usedLegacyMatch: false };
    }
  }

  if (!USE_LEGACY_AM_MATCH) {
    return { member: null, usedLegacyMatch: false };
  }

  const normalizedManager = normalize(customer.account_manager);
  if (!normalizedManager) {
    return { member: null, usedLegacyMatch: false };
  }

  const byFallback = members.find(
    (member) =>
      normalize(member.name) === normalizedManager || normalize(member.email) === normalizedManager,
  );

  return {
    member: byFallback ?? null,
    usedLegacyMatch: Boolean(byFallback),
  };
}

function extractScheduledEffectiveDate(change: Record<string, unknown> | null): string | null {
  if (!change) {
    return null;
  }

  try {
    return typeof change.effective_date === 'string' ? change.effective_date : null;
  } catch {
    return null;
  }
}

function sortTeamRows(rows: TeamMemberView[], sortMode: 'standard' | 'anomalous') {
  return [...rows].sort((left, right) => {
    if (sortMode === 'anomalous') {
      const rightDeviation = right.activityDeviation;
      const leftDeviation = left.activityDeviation;
      if (rightDeviation !== leftDeviation) {
        return rightDeviation - leftDeviation;
      }
    }

    return right.mrr_ore - left.mrr_ore || right.customerCount - left.customerCount;
  });
}

function indexActivities(activities: ActivityRow[]): ActivityIndex {
  const byCmId = new Map<string, ActivityRow[]>();
  const byIdentity = new Map<string, ActivityRow[]>();

  for (const activity of activities) {
    if (activity.cm_id) {
      const current = byCmId.get(activity.cm_id) ?? [];
      current.push(activity);
      byCmId.set(activity.cm_id, current);
    }

    const identities = [normalize(activity.cm_email)];
    for (const identity of identities) {
      if (!identity) {
        continue;
      }

      const current = byIdentity.get(identity) ?? [];
      current.push(activity);
      byIdentity.set(identity, current);
    }
  }

  return { byCmId, byIdentity };
}

function collectMemberActivities(member: TeamMemberRow, index: ActivityIndex) {
  const collected = new Set<ActivityRow>();

  const byCmId = index.byCmId.get(member.id) ?? [];
  for (const item of byCmId) {
    collected.add(item);
  }

  if (!USE_LEGACY_ACTIVITY_MATCH) {
    return Array.from(collected);
  }

  const identifiers = [normalize(member.email), normalize(member.name)];
  for (const identifier of identifiers) {
    if (!identifier) {
      continue;
    }

    const matches = index.byIdentity.get(identifier) ?? [];
    for (const item of matches) {
      collected.add(item);
    }
  }

  return Array.from(collected);
}

function bucketActivitiesByDay(activities: ActivityRow[]) {
  const buckets = new Map<string, number>();

  for (const activity of activities) {
    const dayKey = toDayKey(activity.created_at);
    if (!dayKey) {
      continue;
    }

    buckets.set(dayKey, (buckets.get(dayKey) ?? 0) + 1);
  }

  return buckets;
}

function buildActivitySeries(dayBuckets: Map<string, number>, todayDate: Date, windowDays: number) {
  return Array.from({ length: windowDays }, (_, index) => {
    const date = addDays(todayDate, -((windowDays - 1) - index));
    return dayBuckets.get(formatDateOnly(date)) ?? 0;
  });
}

function buildBaselineSeries(dayBuckets: Map<string, number>, todayDate: Date) {
  return Array.from({ length: 90 }, (_, index) => {
    const date = addDays(todayDate, -(89 - index));
    return {
      date,
      count: dayBuckets.get(formatDateOnly(date)) ?? 0,
    };
  });
}

function toDayKey(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatDateOnly(date);
}

function addDays(baseDate: Date, days: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return startOfDay(date);
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function normalize(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function toDotIntensity(level: DailyDot['level']): 0 | 1 | 2 | 3 {
  if (level === 'empty') return 0;
  if (level === 'low') return 1;
  if (level === 'mid') return 2;
  return 3;
}

function flowScore(videosLast7d: number, engagementRate: number): number {
  const normalizedVideos = Math.min(60, Math.max(0, videosLast7d) * 8);
  const normalizedEngagement = Math.min(40, Math.max(0, engagementRate) * 4);
  return Math.round(Math.min(100, normalizedVideos + normalizedEngagement));
}
