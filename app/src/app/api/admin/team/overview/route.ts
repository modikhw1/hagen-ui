import { getAdminSettings } from '@/lib/admin/settings';
import { listEnrichedCmAbsences } from '@/lib/admin/cm-absences';
import { buildTeamOverview } from '@/lib/admin/server/team-overview';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { z } from 'zod';

type NormalizedActivityRow = {
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

function isMissingColumnError(message?: string | null) {
  return (
    typeof message === 'string' &&
    message.toLowerCase().includes('column') &&
    message.toLowerCase().includes('does not exist')
  );
}

function isMissingTableError(message?: string | null) {
  return (
    typeof message === 'string' &&
    message.toLowerCase().includes('relation') &&
    message.toLowerCase().includes('does not exist')
  );
}

async function fetchActivities(activityCutoff: string) {
  const supabase = createSupabaseAdmin();

  const primary = await (((supabase.from('cm_activities' as never) as never) as {
    select: (value: string) => {
      gte: (column: string, value: string) => {
        order: (column: string, options: { ascending: boolean }) => {
          limit: (value: number) => Promise<{ data: Array<{ cm_id: string | null; cm_email: string | null; type: string | null; created_at: string }> | null; error: { message?: string } | null }>;
        };
      };
    };
  }).select('cm_id, cm_email, type, created_at'))
    .gte('created_at', activityCutoff)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (!primary.error || !isMissingColumnError(primary.error.message)) {
    return {
      data: (primary.data ?? []) as NormalizedActivityRow[],
      error: primary.error,
      usedLegacyFallback: false,
    };
  }

  const fallback = await (((supabase.from('cm_activities' as never) as never) as {
    select: (value: string) => {
      gte: (column: string, value: string) => {
        order: (column: string, options: { ascending: boolean }) => {
          limit: (value: number) => Promise<{ data: Array<{ cm_user_id: string | null; cm_email: string | null; activity_type: string | null; created_at: string }> | null; error: { message?: string } | null }>;
        };
      };
    };
  }).select('cm_user_id, cm_email, activity_type, created_at'))
    .gte('created_at', activityCutoff)
    .order('created_at', { ascending: false })
    .limit(2000);

  return {
    data: (fallback.data ?? []).map((row) => ({
      cm_id: row.cm_user_id,
      cm_email: row.cm_email,
      type: row.activity_type,
      created_at: row.created_at,
    })) as NormalizedActivityRow[],
    error: fallback.error,
    usedLegacyFallback: true,
  };
}

async function fetchAssignments() {
  const supabase = createSupabaseAdmin();
  const result = await (((supabase.from('cm_assignments' as never) as never) as {
    select: (columns: string) => {
      order: (column: string, options: { ascending: boolean }) => Promise<{
        data: AssignmentHistoryRow[] | null;
        error: { message?: string } | null;
      }>;
    };
  }).select(
    'id, customer_id, cm_id, valid_from, valid_to, handover_note, scheduled_change',
  )).order('valid_from', { ascending: false });

  if (result.error) {
    if (isMissingTableError(result.error.message)) {
      return {
        data: [] as AssignmentHistoryRow[],
        usedFallback: true,
        error: null,
      };
    }

    return {
      data: [] as AssignmentHistoryRow[],
      usedFallback: false,
      error: result.error,
    };
  }

  return {
    data: result.data ?? [],
    usedFallback: false,
    error: null,
  };
}

const querySchema = z
  .object({
    sort: z.enum(['standard', 'anomalous']).optional(),
  })
  .strict();

export const GET = withAuth(async (_request, user) => {
  requireScope(user, 'team.read');
  const parsed = querySchema.safeParse({
    sort: _request.nextUrl.searchParams.get('sort') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError('Ogiltiga query-parametrar', 400);
  }

  const supabase = createSupabaseAdmin();
  const settings = await getAdminSettings(supabase);
  const activityCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const statsCutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const [teamResult, customersResult, activitiesResult, tiktokStatsResult, absences, assignmentsResult] = await Promise.all([
    supabase
      .from('team_members')
      .select('id, name, email, phone, role, color, is_active, profile_id, bio, region, avatar_url, commission_rate')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('customer_profiles')
      .select('id, business_name, monthly_price, status, paused_until, account_manager_profile_id, account_manager, last_upload_at')
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

  let normalizedTeam: Array<Record<string, unknown>> =
    (teamResult.data ?? []) as unknown as Array<Record<string, unknown>>;
  const schemaWarnings = [...settings.schemaWarnings];

  if (teamResult.error && isMissingColumnError(teamResult.error.message)) {
    const fallbackTeam = await (((supabase.from('team_members' as never) as never) as {
      select: (columns: string) => {
        eq: (column: string, value: boolean) => {
          order: (orderColumn: string) => Promise<{
            data: Array<Record<string, unknown>> | null;
            error: { message?: string } | null;
          }>;
        };
      };
    }).select('id, name, email, phone, role, color, is_active, profile_id, bio, region, avatar_url'))
      .eq('is_active', true)
      .order('name');

    if (fallbackTeam.error) {
      return jsonError(fallbackTeam.error.message || 'Kunde inte hamta team-oversikten', 500);
    }

    normalizedTeam = (fallbackTeam.data ?? []).map((member) => ({
      ...member,
      commission_rate: settings.settings.default_commission_rate,
    }));
    schemaWarnings.push('Kolumnen team_members.commission_rate saknas i databasen. Team-oversikten visar defaultkommission.');
  } else if (teamResult.error) {
    return jsonError(teamResult.error.message, 500);
  }
  if (customersResult.error) {
    return jsonError(customersResult.error.message, 500);
  }
  if (activitiesResult.error) {
    return jsonError(activitiesResult.error.message || 'Kunde inte hamta aktiviteter', 500);
  }
  if (assignmentsResult.error) {
    return jsonError(assignmentsResult.error.message || 'Kunde inte hamta CM-historik', 500);
  }
  if (tiktokStatsResult.error && !isMissingTableError(tiktokStatsResult.error.message)) {
    return jsonError(tiktokStatsResult.error.message, 500);
  }

  const byCustomer: Record<string, { followers: number; videos_last_7d: number; engagement_rate: number }> = {};
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

  const payload = buildTeamOverview({
    members: normalizedTeam as Array<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      role: string;
      color: string | null;
      is_active: boolean;
      profile_id: string | null;
      bio: string | null;
      region: string | null;
      avatar_url: string | null;
      commission_rate: number | null;
    }>,
    customers: (customersResult.data ?? []) as Array<{
      id: string;
      business_name: string;
      monthly_price: number | null;
      status: string;
      paused_until?: string | null;
      account_manager_profile_id: string | null;
      account_manager: string | null;
      last_upload_at: string | null;
    }>,
    activities: activitiesResult.data,
    assignments: assignmentsResult.data,
    absences,
    byCustomer,
    sortMode: parsed.data.sort ?? 'standard',
  });

  for (const warning of [
    ...schemaWarnings,
    ...(assignmentsResult.usedFallback
      ? ['Tabellen cm_assignments saknas i denna miljo. Team-vyn visar bara nuvarande kunder utan periodhistorik.']
      : []),
    ...(activitiesResult.usedLegacyFallback
      ? ['cm_activities anvander legacy-kolumner i denna miljo och normaliseras i API-lagret.']
      : []),
  ]) {
    console.warn('[admin.team.overview]', warning);
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=30',
    },
  });
}, ['admin']);
