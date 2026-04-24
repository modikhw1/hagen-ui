import 'server-only';

import { unstable_cache } from 'next/cache';
import { formatDateOnly } from '@/lib/admin/billing-periods';
import { ADMIN_TEAM_TAG } from '@/lib/admin/cache-tags';
import { listEnrichedCmAbsences } from '@/lib/admin/cm-absences';
import type { TeamMemberView } from '@/lib/admin/dtos/team';
import { isMissingRelationError } from '@/lib/admin/schema-guards';
import {
  parseRowsWithWarnings,
  teamOverviewActivityInputSchema,
  teamOverviewAssignmentInputSchema,
  teamOverviewCustomerInputSchema,
  teamOverviewMemberInputSchema,
  type TeamOverviewActivityInput,
  type TeamOverviewAssignmentInput,
  type TeamOverviewMemberInput,
} from '@/lib/admin/schemas/team-overview-input';
import { buildTeamOverview } from '@/lib/admin/server/team-overview';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

type NormalizedActivityRow = TeamOverviewActivityInput;

type AssignmentHistoryRow = TeamOverviewAssignmentInput;

type TeamOverviewMemberRow = TeamOverviewMemberInput;

type TeamOverviewLoadResult = {
  members: TeamMemberView[];
  asOfDate: string;
  schemaWarnings: string[];
  buildDurationMs: number;
};

async function fetchActivities(activityCutoff: string) {
  const supabase = createSupabaseAdmin();
  const result = await supabase
    .from('cm_activities')
    .select('cm_id, cm_user_id, cm_email, type, activity_type, created_at')
    .gte('created_at', activityCutoff)
    .order('created_at', { ascending: false })
    .limit(2000);

  return {
    data: (result.data ?? [])
      .filter(
        (row): row is typeof row & { created_at: string } => typeof row.created_at === 'string',
      )
      .map((row) => ({
        cm_id: row.cm_id ?? row.cm_user_id ?? null,
        cm_email: row.cm_email ?? null,
        type: row.type ?? row.activity_type ?? null,
        created_at: row.created_at,
      })) satisfies NormalizedActivityRow[],
    error: result.error,
  };
}

async function fetchAssignments() {
  const supabase = createSupabaseAdmin();
  const result = await supabase
    .from('cm_assignments')
    .select('id, customer_id, cm_id, valid_from, valid_to, handover_note, scheduled_change')
    .order('valid_from', { ascending: false });

  if (result.error) {
    return {
      data: [] as AssignmentHistoryRow[],
      error: result.error,
    };
  }

  return {
    data: (result.data ?? []) as AssignmentHistoryRow[],
    error: null,
  };
}

async function fetchTeamMembersOverview() {
  const supabase = createSupabaseAdmin();
  const viewResult = await (((supabase.from('admin_team_overview' as never) as never) as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{
        data: TeamOverviewMemberRow[] | null;
        error: { message?: string } | null;
      }>;
    };
  }).select(
    'id, name, email, phone, role, is_active, profile_id, bio, city, avatar_url, commission_rate, customer_count, mrr_ore, customer_load_level, customer_load_label, overloaded',
  )).order('name', { ascending: true });

  if (!viewResult.error) {
    return {
      data: (viewResult.data ?? []) as TeamOverviewMemberRow[],
      error: null,
    };
  }

  if (!isMissingRelationError(viewResult.error.message)) {
    return {
      data: [] as TeamOverviewMemberRow[],
      error: viewResult.error,
    };
  }

  const fallbackResult = await supabase
    .from('team_members')
    .select('id, name, email, phone, role, is_active, profile_id, bio, region, avatar_url, commission_rate')
    .eq('is_active', true)
    .order('name');

  if (fallbackResult.error) {
    return {
      data: [] as TeamOverviewMemberRow[],
      error: fallbackResult.error,
    };
  }

  return {
    data: (fallbackResult.data ?? []).map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      role: member.role,
      is_active: member.is_active,
      profile_id: member.profile_id,
      bio: member.bio,
      city: member.region,
      avatar_url: member.avatar_url,
      commission_rate: member.commission_rate,
      customer_count: null,
      mrr_ore: null,
      customer_load_level: null,
      customer_load_label: null,
      overloaded: null,
    })),
    error: null,
  };
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function toBuildWarningCode(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function mergeWarnings(...warningGroups: Array<string[]>) {
  return Array.from(new Set(warningGroups.flat()));
}

function buildFallbackTeamOverview(members: TeamOverviewMemberInput[]): TeamMemberView[] {
  const today = startOfDay(new Date());

  return members.map((member) => {
    const activitySeries = new Array(14).fill(0);
    const activityDots = Array.from({ length: 14 }, (_, index) => {
      const date = addDays(today, -(13 - index));
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;

      return {
        date,
        count: 0,
        level: 'empty' as const,
        intensity: 0 as const,
        isWeekend,
      };
    });

    return {
      id: member.id,
      name: member.name,
      email: member.email ?? '',
      phone: member.phone,
      city: member.city,
      bio: member.bio,
      avatar_url: member.avatar_url,
      role: member.role ?? 'content_manager',
      is_active: Boolean(member.is_active ?? true),
      commission_rate: Number.isFinite(Number(member.commission_rate)) ? Number(member.commission_rate) : 0.2,
      active_absence: null,
      customers: [],
      assignmentHistory: [],
      customerCount: 0,
      mrr_ore: 0,
      activityCount: 0,
      activeWorkflowSteps: 0,
      activityRatio: 0,
      activitySeries,
      activityDots,
      activitySummary: {
        activeDays: 0,
        total: 0,
        median: 0,
        longestRest: 14,
      },
      activityBaseline: 0,
      activityAverage7d: 0,
      activityDeviation: 0,
      customerLoadLevel: 'ok',
      customerLoadClass: 'ok',
      customerLoadLabel: 'Lätt portfölj',
      overloaded: false,
    };
  });
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

async function loadTeamOverview(sortMode: 'standard' | 'anomalous'): Promise<TeamOverviewLoadResult> {
  const supabase = createSupabaseAdmin();
  const activityCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const statsCutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const [
    teamResult,
    customersResult,
    activitiesResult,
    tiktokStatsResult,
    absences,
    assignmentsResult,
  ] = await Promise.all([
    fetchTeamMembersOverview(),
    supabase
      .from('customer_profiles')
      .select(
        'id, business_name, monthly_price, status, paused_until, account_manager_profile_id, account_manager, last_upload_at',
      )
      .neq('status', 'archived'),
    fetchActivities(activityCutoff),
    supabase
      .from('tiktok_stats')
      .select('customer_profile_id, followers, videos_last_24h, engagement_rate, snapshot_date')
      .gte('snapshot_date', statsCutoff)
      .order('snapshot_date', { ascending: false }),
    listEnrichedCmAbsences(supabase, { limit: 200 }),
    fetchAssignments(),
  ]);

  if (teamResult.error) {
    throw new Error(teamResult.error.message || 'Kunde inte hämta teamöversikten');
  }
  if (customersResult.error) {
    throw new Error(customersResult.error.message || 'Kunde inte hämta kunder');
  }
  if (activitiesResult.error) {
    throw new Error(activitiesResult.error.message || 'Kunde inte hämta aktiviteter');
  }
  if (assignmentsResult.error) {
    throw new Error(assignmentsResult.error.message || 'Kunde inte hämta CM-historik');
  }
  if (tiktokStatsResult.error) {
    throw new Error(tiktokStatsResult.error.message || 'Kunde inte hämta TikTok-statistik');
  }

  const parsedMembers = parseRowsWithWarnings({
    rows: teamResult.data,
    schema: teamOverviewMemberInputSchema,
    rowType: 'member',
  });
  const parsedCustomers = parseRowsWithWarnings({
    rows: customersResult.data,
    schema: teamOverviewCustomerInputSchema,
    rowType: 'customer',
  });
  const parsedActivities = parseRowsWithWarnings({
    rows: activitiesResult.data,
    schema: teamOverviewActivityInputSchema,
    rowType: 'activity',
  });
  const parsedAssignments = parseRowsWithWarnings({
    rows: assignmentsResult.data,
    schema: teamOverviewAssignmentInputSchema,
    rowType: 'assignment',
  });

  const schemaWarnings = mergeWarnings(
    parsedMembers.warnings,
    parsedCustomers.warnings,
    parsedActivities.warnings,
    parsedAssignments.warnings,
  );

  const byCustomer: Record<
    string,
    { followers: number; videos_last_7d: number; engagement_rate: number }
  > = {};

  for (const row of tiktokStatsResult.data ?? []) {
    const key = row.customer_profile_id;
    if (!key) continue;

    const current = byCustomer[key] ?? {
      followers: row.followers ?? 0,
      videos_last_7d: 0,
      engagement_rate: Number(row.engagement_rate ?? 0),
    };

    if (!byCustomer[key]) {
      current.followers = row.followers ?? 0;
      current.engagement_rate = Number(row.engagement_rate ?? 0);
    }

    current.videos_last_7d += row.videos_last_24h ?? 0;
    byCustomer[key] = current;
  }

  const buildStart = nowMs();

  try {
    const built = buildTeamOverview({
      members: parsedMembers.rows.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        role: member.role,
        is_active: Boolean(member.is_active ?? true),
        profile_id: member.profile_id,
        bio: member.bio,
        city: member.city,
        avatar_url: member.avatar_url,
        commission_rate: member.commission_rate,
        customer_count: member.customer_count ?? null,
        mrr_ore: member.mrr_ore ?? null,
        customer_load_level: member.customer_load_level ?? null,
        customer_load_label: member.customer_load_label ?? null,
        overloaded: member.overloaded ?? null,
      })),
      customers: parsedCustomers.rows.map((customer) => ({
        id: customer.id,
        business_name: customer.business_name,
        monthly_price: customer.monthly_price,
        status: customer.status,
        paused_until: customer.paused_until,
        account_manager_profile_id: customer.account_manager_profile_id,
        account_manager: customer.account_manager,
        last_upload_at: customer.last_upload_at,
      })),
      activities: parsedActivities.rows,
      assignments: parsedAssignments.rows,
      absences,
      byCustomer,
      sortMode,
    });

    const buildDurationMs = nowMs() - buildStart;

    return {
      ...built,
      schemaWarnings: mergeWarnings(schemaWarnings, built.schemaWarnings),
      buildDurationMs,
    };
  } catch (error) {
    const buildDurationMs = nowMs() - buildStart;

    console.error('[admin.team-overview] build failed, returning degraded payload', {
      error: toBuildWarningCode(error),
      member_count: parsedMembers.rows.length,
      customer_count: parsedCustomers.rows.length,
    });

    return {
      members: buildFallbackTeamOverview(parsedMembers.rows),
      asOfDate: formatDateOnly(new Date()),
      schemaWarnings: mergeWarnings(schemaWarnings, [
        'team-overview-degraded',
        `team-overview-build-failed:${toBuildWarningCode(error)}`,
      ]),
      buildDurationMs,
    };
  }
}

export async function loadAdminTeamOverview(sortMode: 'standard' | 'anomalous') {
  return unstable_cache(async () => loadTeamOverview(sortMode), ['admin-team-overview', sortMode], {
    revalidate: 60,
    tags: [ADMIN_TEAM_TAG],
  })();
}
