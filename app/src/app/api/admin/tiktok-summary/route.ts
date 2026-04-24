import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(async () => {
  const supabaseAdmin = createSupabaseAdmin();
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from('tiktok_stats')
    .select('customer_profile_id, followers, videos_last_24h, engagement_rate, snapshot_date')
    .gte('snapshot_date', cutoff)
    .order('snapshot_date', { ascending: false });

  if (error) {
    return jsonError(error.message, 500);
  }

  const byCustomer: Record<
    string,
    { followers: number; videos_last_7d: number; engagement_rate: number }
  > = {};

  for (const row of data ?? []) {
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

  return jsonOk({ byCustomer });
}, ['admin']);
