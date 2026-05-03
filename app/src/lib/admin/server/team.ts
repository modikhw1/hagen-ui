import 'server-only';

import { unstable_cache } from 'next/cache';
import { ADMIN_TEAM_TAG } from '@/lib/admin/cache-tags';
import { formatDateOnly } from '@/lib/admin/billing-periods';
import { listEnrichedCmAbsences } from '@/lib/admin/cm-absences';
import type { TeamMemberView } from '@/lib/admin/dtos/team';
import {
  loadCmPulseBase,
  loadOverviewCmPulseSection,
  type BaseOverviewData,
} from '@/lib/admin/server/overview';
import { buildTeamOverview } from '@/lib/admin/server/team-overview';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

type TeamOverviewLoadResult = {
  members: TeamMemberView[];
  asOfDate: string;
  schemaWarnings: string[];
  buildDurationMs: number;
};

type TeamMemberDetailRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  color: string | null;
  is_active: boolean | null;
  commission_rate: number | null;
  created_at: string | null;
  profile_id: string | null;
  avatar_url: string | null;
  bio: string | null;
  region: string | null;
};

type AssignmentRow = {
  id: string;
  customer_id: string;
  cm_id: string | null;
  valid_from: string;
  valid_to: string | null;
  handover_note: string | null;
  scheduled_change: Record<string, unknown> | null;
};

type TikTokStatRow = {
  customer_profile_id: string | null;
  followers: number | null;
  videos_last_24h: number | null;
  engagement_rate: number | null;
  snapshot_date: string | null;
};

type LatestPublicationRow = {
  customer_profile_id: string | null;
  concept_id: string | null;
  history_source: string | null;
  published_at: string | null;
};

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function toOverviewSortMode(sortMode: 'standard' | 'anomalous') {
  return sortMode === 'anomalous' ? 'lowest_activity' : 'standard';
}

function buildCustomerStatsIndex(rows: TikTokStatRow[]) {
  const statsByCustomer = new Map<
    string,
    {
      followers: number;
      videos_last_7d: number;
      engagement_rate: number;
      latestSnapshotDate: string | null;
    }
  >();

  for (const row of rows) {
    if (!row.customer_profile_id) {
      continue;
    }

    const current = statsByCustomer.get(row.customer_profile_id) ?? {
      followers: 0,
      videos_last_7d: 0,
      engagement_rate: 0,
      latestSnapshotDate: null,
    };

    current.videos_last_7d += row.videos_last_24h ?? 0;

    const snapshotDate = row.snapshot_date ?? null;
    if (
      snapshotDate &&
      (!current.latestSnapshotDate || snapshotDate > current.latestSnapshotDate)
    ) {
      current.latestSnapshotDate = snapshotDate;
      current.followers = row.followers ?? 0;
      current.engagement_rate = row.engagement_rate ?? 0;
    }

    statsByCustomer.set(row.customer_profile_id, current);
  }

  return Object.fromEntries(
    Array.from(statsByCustomer.entries()).map(([customerId, value]) => [
      customerId,
      {
        followers: value.followers,
        videos_last_7d: value.videos_last_7d,
        engagement_rate: value.engagement_rate,
      },
    ]),
  );
}

function normalizePublicationSource(row: Pick<LatestPublicationRow, 'concept_id' | 'history_source'>) {
  if (row.history_source === 'tiktok_profile') {
    return 'tiktok' as const;
  }

  if (row.concept_id || row.history_source === 'hagen_library') {
    return 'letrend' as const;
  }

  return null;
}

function buildLatestPublicationIndex(rows: LatestPublicationRow[]) {
  const publicationsByCustomer = new Map<
    string,
    {
      publishedAt: string | null;
      source: 'letrend' | 'tiktok' | null;
    }
  >();

  for (const row of rows) {
    if (!row.customer_profile_id || !row.published_at || publicationsByCustomer.has(row.customer_profile_id)) {
      continue;
    }

    publicationsByCustomer.set(row.customer_profile_id, {
      publishedAt: row.published_at,
      source: normalizePublicationSource(row),
    });
  }

  return publicationsByCustomer;
}

function mapBaseCustomers(
  baseData: BaseOverviewData,
  latestPublicationsByCustomer: Map<
    string,
    {
      publishedAt: string | null;
      source: 'letrend' | 'tiktok' | null;
    }
  >,
) {
  const bufferByCustomer = new Map(
    baseData.bufferRows.map((row) => [row.customer_id, row.last_published_at ?? null]),
  );

  return baseData.customers
    .filter((customer) => customer.status !== 'archived')
    .map((customer) => {
      const latestPublication = latestPublicationsByCustomer.get(customer.id);
      const lastPublishedAt =
        bufferByCustomer.get(customer.id) ??
        latestPublication?.publishedAt ??
        customer.last_upload_at ??
        null;

      const briefDays = (customer as any).brief?.posting_weekdays;
      const uploadScheduleCount =
        Array.isArray(briefDays) && briefDays.length > 0 ? briefDays.length : null;

      return {
        id: customer.id,
        business_name: customer.business_name,
        monthly_price: customer.monthly_price ?? null,
        status: customer.status ?? 'active',
        paused_until: customer.paused_until ?? null,
        account_manager_profile_id: customer.account_manager_profile_id ?? null,
        account_manager: customer.account_manager ?? null,
        last_upload_at: customer.last_upload_at ?? null,
        last_published_at: lastPublishedAt,
        last_publication_source:
          lastPublishedAt && latestPublication?.publishedAt === lastPublishedAt
            ? latestPublication.source
            : customer.last_upload_at && customer.last_upload_at === lastPublishedAt
              ? 'tiktok'
              : latestPublication?.source ?? null,
        planned_concepts_count: customer.planned_concepts_count ?? 0,
        expected_concepts_per_week:
          uploadScheduleCount ??
          customer.expected_concepts_per_week ??
          customer.concepts_per_week ??
          0,
        overdue_7d_concepts_count: customer.overdue_7d_concepts_count ?? 0,
      };
    });
}

function mapPulseIntoMembers(
  members: TeamMemberView[],
  pulseRows: Awaited<ReturnType<typeof loadOverviewCmPulseSection>>['cmPulse'],
) {
  const pulseByCmId = new Map(
    pulseRows.map((row) => [
      row.member.id,
      {
        status: row.aggregate.status,
        fillPct: row.aggregate.fillPct,
        barLabel: row.aggregate.barLabel,
        plannedConceptsTotal: row.aggregate.planned_concepts_total,
        expectedConcepts7d: row.aggregate.expected_concepts_7d,
        interactionCount7d: row.aggregate.interaction_count_7d,
        lastInteractionDays: row.aggregate.last_interaction_days,
        counts: row.aggregate.counts,
      },
    ]),
  );

  return members.map((member) => ({
    ...member,
    pulse:
      pulseByCmId.get(member.id) ?? {
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
  }));
}

function includeMemberInTeamView(member: TeamMemberView) {
  if (member.role === 'content_manager') {
    return true;
  }

  return (
    member.customers.length > 0 ||
    member.assignmentHistory.length > 0 ||
    Boolean(member.active_absence) ||
    Boolean(member.isCovering)
  );
}

async function loadTeamOverview(sortMode: 'standard' | 'anomalous'): Promise<TeamOverviewLoadResult> {
  const queryStart = nowMs();
  const supabase = createSupabaseAdmin();
  const today = formatDateOnly(new Date());
  const overviewSortMode = toOverviewSortMode(sortMode);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const baseData = await loadCmPulseBase(supabase);
  const activeCustomerIds = baseData.customers
    .filter((customer) => customer.status !== 'archived')
    .map((customer) => customer.id);

  const [
    membersResult,
    assignmentsResult,
    statsResult,
    latestPublicationsResult,
    absences,
    pulseSection,
  ] = await Promise.all([
    supabase
      .from('team_members')
      .select(
        'id, name, email, phone, role, color, is_active, commission_rate, created_at, profile_id, avatar_url, bio, region',
      )
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('cm_assignments')
      .select('id, customer_id, cm_id, valid_from, valid_to, handover_note, scheduled_change'),
    supabase
      .from('tiktok_stats')
      .select(
        'customer_profile_id, followers, videos_last_24h, engagement_rate, snapshot_date',
      )
      .gte('snapshot_date', sevenDaysAgo),
    activeCustomerIds.length > 0
      ? supabase
          .from('customer_concepts')
          .select('customer_profile_id, concept_id, history_source, published_at')
          .in('customer_profile_id', activeCustomerIds)
          .not('published_at', 'is', null)
          .order('customer_profile_id', { ascending: true })
          .order('published_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    listEnrichedCmAbsences(supabase, { limit: 200, asOfDate: today }),
    loadOverviewCmPulseSection({
      sortMode: overviewSortMode,
      baseData,
    }),
  ]);

  if (membersResult.error) {
    throw new Error(membersResult.error.message || 'Kunde inte hämta teammedlemmar');
  }
  if (assignmentsResult.error) {
    throw new Error(assignmentsResult.error.message || 'Kunde inte hämta CM-historik');
  }
  if (statsResult.error) {
    throw new Error(statsResult.error.message || 'Kunde inte hämta TikTok-statistik');
  }
  if (latestPublicationsResult.error) {
    throw new Error(
      latestPublicationsResult.error.message || 'Kunde inte hämta senaste publiceringar',
    );
  }

  const members = (membersResult.data ?? []) as TeamMemberDetailRow[];
  const assignments = (assignmentsResult.data ?? []) as AssignmentRow[];
  const tiktokStats = (statsResult.data ?? []) as TikTokStatRow[];
  const latestPublicationRows = (latestPublicationsResult.data ?? []) as LatestPublicationRow[];
  const customerStatsById = buildCustomerStatsIndex(tiktokStats);
  const latestPublicationsByCustomer = buildLatestPublicationIndex(latestPublicationRows);

  const built = buildTeamOverview({
    members: members.map((member) => ({
      ...member,
      city: member.region ?? null,
      is_active: Boolean(member.is_active),
    })),
    customers: mapBaseCustomers(baseData, latestPublicationsByCustomer),
    activities: baseData.interactions.map((interaction) => ({
      cm_id: interaction.cm_id,
      cm_email: null,
      type: interaction.type,
      created_at: interaction.created_at ?? new Date().toISOString(),
    })),
    assignments,
    absences,
    byCustomer: customerStatsById,
    sortMode,
  });

  const pulseMappedMembers = mapPulseIntoMembers(built.members, pulseSection.cmPulse).filter(
    includeMemberInTeamView,
  );

  return {
    members: pulseMappedMembers,
    asOfDate: built.asOfDate,
    schemaWarnings: built.schemaWarnings,
    buildDurationMs: nowMs() - queryStart,
  };
}

export async function loadAdminTeamOverview(
  sortMode: 'standard' | 'anomalous',
): Promise<TeamOverviewLoadResult> {
  return unstable_cache(async () => loadTeamOverview(sortMode), ['admin-team-overview-v2', sortMode], {
    revalidate: 30,
    tags: [ADMIN_TEAM_TAG],
  })();
}
