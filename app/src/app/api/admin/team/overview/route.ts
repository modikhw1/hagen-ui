import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

type NormalizedActivityRow = {
  cm_id: string | null;
  cm_email: string | null;
  type: string | null;
  created_at: string;
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

export const GET = withAuth(async () => {
  const supabase = createSupabaseAdmin();
  const activityCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const statsCutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const [teamResult, customersResult, activitiesResult, tiktokStatsResult] = await Promise.all([
    supabase
      .from('team_members')
      .select('id, name, email, phone, role, color, is_active, profile_id, bio, region, avatar_url')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('customer_profiles')
      .select('id, business_name, monthly_price, status, account_manager_profile_id, account_manager, last_upload_at')
      .neq('status', 'archived'),
    fetchActivities(activityCutoff),
    supabase
      .from('tiktok_stats')
      .select('customer_profile_id, followers, videos_last_24h, engagement_rate, snapshot_date')
      .gte('snapshot_date', statsCutoff)
      .order('snapshot_date', { ascending: false }),
  ]);

  if (teamResult.error) {
    return jsonError(teamResult.error.message, 500);
  }
  if (customersResult.error) {
    return jsonError(customersResult.error.message, 500);
  }
  if (activitiesResult.error) {
    return jsonError(activitiesResult.error.message || 'Kunde inte hamta aktiviteter', 500);
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

  return jsonOk({
    members: teamResult.data ?? [],
    customers: customersResult.data ?? [],
    activities: activitiesResult.data,
    byCustomer,
    schemaWarnings: activitiesResult.usedLegacyFallback
      ? ['cm_activities anvander legacy-kolumner i denna miljo och normaliseras i API-lagret.']
      : [],
  });
}, ['admin']);
