import type { SupabaseClient } from '@supabase/supabase-js';
import { tikTokStatsSchema, type TikTokStats } from '@/lib/admin/dtos/customer';
import { isMissingRelationError } from '@/lib/admin/schema-guards';
import type { Database } from '@/types/database';

type AppSupabaseClient = Pick<SupabaseClient<Database>, 'from'>;

export type TikTokStatsSnapshotRow = {
  snapshot_date: string;
  followers: number;
  total_videos: number;
  videos_last_24h: number;
  total_views_24h: number;
  engagement_rate: number;
};

export type TikTokVideoRow = {
  video_id: string;
  uploaded_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  share_url: string | null;
  cover_image_url: string | null;
  description: string | null;
};

export type CustomerTikTokRuntimeProfile = {
  id: string;
  tiktok_profile_url: string | null;
  tiktok_handle: string | null;
  tiktok_profile_pic_url: string | null;
  last_history_sync_at: string | null;
  pending_history_advance_at: string | null;
  last_upload_at: string | null;
};

export type CustomerTikTokRuntime = {
  profile: CustomerTikTokRuntimeProfile | null;
  stats: TikTokStats | null;
  stats_history_30d: TikTokStatsSnapshotRow[];
  recent_videos_30d: TikTokVideoRow[];
};

export type CustomerTikTokSummary = {
  followers: number;
  videos_last_7d: number;
  engagement_rate: number;
  follower_delta_7d: number;
  follower_delta_30d: number;
  total_videos: number;
  window_end_iso: string | null;
};

export type CustomerTikTokPulseSummary = {
  history: TikTokStatsSnapshotRow[];
  current_followers: number;
  follower_delta_7d: number;
  follower_delta_30d: number;
  avg_engagement: number;
  recent_videos: TikTokVideoRow[];
};

function carryForwardFollowers(rows: TikTokStatsSnapshotRow[]): TikTokStatsSnapshotRow[] {
  let lastKnownFollowers = 0;

  return rows.map((row) => {
    const normalizedFollowers = row.followers > 0 ? row.followers : lastKnownFollowers;

    if (normalizedFollowers > 0) {
      lastKnownFollowers = normalizedFollowers;
    }

    return {
      ...row,
      followers: normalizedFollowers,
    };
  });
}

function normalizeStatsRows(rows: Array<Record<string, unknown>>): TikTokStatsSnapshotRow[] {
  return rows.map((row) => ({
    snapshot_date: String(row.snapshot_date ?? ''),
    followers: Number(row.followers ?? 0),
    total_videos: Number(row.total_videos ?? 0),
    videos_last_24h: Number(row.videos_last_24h ?? 0),
    total_views_24h: Number(row.total_views_24h ?? 0),
    engagement_rate: Number(row.engagement_rate ?? 0),
  }));
}

function normalizeVideoRows(rows: Array<Record<string, unknown>>): TikTokVideoRow[] {
  return rows.map((row) => ({
    video_id: String(row.video_id ?? ''),
    uploaded_at: String(row.uploaded_at ?? ''),
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    shares: Number(row.shares ?? 0),
    share_url: typeof row.share_url === 'string' ? row.share_url : null,
    cover_image_url: typeof row.cover_image_url === 'string' ? row.cover_image_url : null,
    description:
      row.raw_payload &&
      typeof row.raw_payload === 'object' &&
      typeof (row.raw_payload as { description?: unknown }).description === 'string'
        ? ((row.raw_payload as { description?: string }).description ?? null)
        : null,
  }));
}

export function buildCustomerTikTokStats(params: {
  statsRows: TikTokStatsSnapshotRow[];
  recentVideos: TikTokVideoRow[];
}): TikTokStats | null {
  if (params.statsRows.length === 0) {
    return null;
  }

  const normalizedData = carryForwardFollowers(params.statsRows);
  const latest = normalizedData[normalizedData.length - 1];
  const earliest = normalizedData[0];
  const last7 = normalizedData.slice(-7);

  const followerDelta7d =
    last7.length >= 2
      ? Math.round(
          ((latest.followers - last7[0].followers) / Math.max(1, last7[0].followers)) * 1000,
        ) / 10
      : 0;
  const followerDelta30d =
    Math.round(
      ((latest.followers - earliest.followers) / Math.max(1, earliest.followers)) * 1000,
    ) / 10;

  return tikTokStatsSchema.parse({
    followers: latest.followers,
    follower_delta_7d: followerDelta7d,
    follower_delta_30d: followerDelta30d,
    avg_views_7d: Math.round(
      last7.reduce((sum, row) => sum + row.total_views_24h, 0) / Math.max(1, last7.length),
    ),
    avg_views_30d: Math.round(
      normalizedData.reduce((sum, row) => sum + row.total_views_24h, 0) / normalizedData.length,
    ),
    engagement_rate: latest.engagement_rate,
    total_videos: latest.total_videos,
    videos_last_7d: last7.reduce((sum, row) => sum + row.videos_last_24h, 0),
    follower_history_30d: normalizedData.map((row) => row.followers),
    views_history_30d: normalizedData.map((row) => row.total_views_24h),
    snapshot_dates_30d: normalizedData.map((row) => row.snapshot_date),
    recent_videos: params.recentVideos,
    window_end_iso: `${latest.snapshot_date}T12:00:00.000Z`,
  });
}

export function buildCustomerTikTokPulseSummary(
  runtime: CustomerTikTokRuntime,
): CustomerTikTokPulseSummary | null {
  if (!runtime.stats) {
    return null;
  }

  const history = [...(runtime.stats_history_30d || [])];
  const avgEngagement =
    history.reduce((sum, row) => sum + Number(row.engagement_rate || 0), 0) /
    Math.max(1, history.length);

  return {
    history,
    current_followers: runtime.stats.followers,
    follower_delta_7d: runtime.stats.follower_delta_7d,
    follower_delta_30d: runtime.stats.follower_delta_30d,
    avg_engagement: avgEngagement,
    recent_videos: runtime.recent_videos_30d,
  };
}

export async function fetchCustomerTikTokRuntime(params: {
  customerId: string;
  supabase: AppSupabaseClient;
  windowDays?: number;
}): Promise<CustomerTikTokRuntime> {
  const windowDays = params.windowDays ?? 30;
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const cutoffIso = `${cutoff}T00:00:00.000Z`;

  const [profileResult, statsResult, videosResult] = await Promise.all([
    params.supabase
      .from('customer_profiles')
      .select(
        'id, tiktok_profile_url, tiktok_handle, tiktok_profile_pic_url, last_history_sync_at, pending_history_advance_at, last_upload_at',
      )
      .eq('id', params.customerId)
      .maybeSingle(),
    params.supabase
      .from('tiktok_stats')
      .select(
        'snapshot_date, followers, total_videos, videos_last_24h, total_views_24h, engagement_rate',
      )
      .eq('customer_profile_id', params.customerId)
      .gte('snapshot_date', cutoff)
      .order('snapshot_date', { ascending: true }),
    params.supabase
      .from('tiktok_videos')
      .select(
        'video_id, uploaded_at, views, likes, comments, shares, share_url, cover_image_url, raw_payload',
      )
      .eq('customer_profile_id', params.customerId)
      .gte('uploaded_at', cutoffIso)
      .order('uploaded_at', { ascending: true }),
  ]);

  if (profileResult.error) {
    throw new Error(profileResult.error.message || 'Kunde inte ladda TikTok-profil');
  }

  if (statsResult.error && !isMissingRelationError(statsResult.error.message)) {
    throw new Error(statsResult.error.message || 'Kunde inte ladda TikTok-statistik');
  }

  if (videosResult.error && !isMissingRelationError(videosResult.error.message)) {
    throw new Error(videosResult.error.message || 'Kunde inte ladda TikTok-videor');
  }

  const profile = profileResult.data
    ? {
        id: String(profileResult.data.id),
        tiktok_profile_url:
          typeof profileResult.data.tiktok_profile_url === 'string'
            ? profileResult.data.tiktok_profile_url
            : null,
        tiktok_handle:
          typeof profileResult.data.tiktok_handle === 'string'
            ? profileResult.data.tiktok_handle
            : null,
        tiktok_profile_pic_url:
          typeof profileResult.data.tiktok_profile_pic_url === 'string'
            ? profileResult.data.tiktok_profile_pic_url
            : null,
        last_history_sync_at:
          typeof profileResult.data.last_history_sync_at === 'string'
            ? profileResult.data.last_history_sync_at
            : null,
        pending_history_advance_at:
          typeof profileResult.data.pending_history_advance_at === 'string'
            ? profileResult.data.pending_history_advance_at
            : null,
        last_upload_at:
          typeof profileResult.data.last_upload_at === 'string'
            ? profileResult.data.last_upload_at
            : null,
      }
    : null;

  const statsRows = statsResult.data
    ? normalizeStatsRows(statsResult.data as Array<Record<string, unknown>>)
    : [];
  const recentVideos = videosResult.data
    ? normalizeVideoRows(videosResult.data as Array<Record<string, unknown>>)
    : [];

  return {
    profile,
    stats: buildCustomerTikTokStats({
      statsRows,
      recentVideos,
    }),
    stats_history_30d: carryForwardFollowers(statsRows),
    recent_videos_30d: recentVideos,
  };
}

export async function fetchCustomerTikTokSummaryMap(params: {
  supabase: AppSupabaseClient;
  customerIds?: string[];
  windowDays?: number;
}): Promise<Record<string, CustomerTikTokSummary>> {
  const windowDays = params.windowDays ?? 30;
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let query = params.supabase
    .from('tiktok_stats')
    .select(
      'customer_profile_id, snapshot_date, followers, total_videos, videos_last_24h, total_views_24h, engagement_rate',
    )
    .gte('snapshot_date', cutoff)
    .order('snapshot_date', { ascending: true });

  if (params.customerIds && params.customerIds.length > 0) {
    query = query.in('customer_profile_id', params.customerIds);
  }

  const result = await query;
  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return {};
    }
    throw new Error(result.error.message || 'Kunde inte ladda TikTok-sammanfattning');
  }

  const grouped = new Map<string, TikTokStatsSnapshotRow[]>();
  for (const row of result.data ?? []) {
    const customerId =
      typeof row.customer_profile_id === 'string' ? row.customer_profile_id : null;
    if (!customerId) continue;

    const current = grouped.get(customerId) ?? [];
    current.push({
      snapshot_date: String(row.snapshot_date ?? ''),
      followers: Number(row.followers ?? 0),
      total_videos: Number(row.total_videos ?? 0),
      videos_last_24h: Number(row.videos_last_24h ?? 0),
      total_views_24h: Number(row.total_views_24h ?? 0),
      engagement_rate: Number(row.engagement_rate ?? 0),
    });
    grouped.set(customerId, current);
  }

  const summary: Record<string, CustomerTikTokSummary> = {};
  for (const [customerId, statsRows] of grouped.entries()) {
    const stats = buildCustomerTikTokStats({
      statsRows,
      recentVideos: [],
    });

    if (!stats) continue;

    summary[customerId] = {
      followers: stats.followers,
      videos_last_7d: stats.videos_last_7d,
      engagement_rate: stats.engagement_rate,
      follower_delta_7d: stats.follower_delta_7d,
      follower_delta_30d: stats.follower_delta_30d,
      total_videos: stats.total_videos,
      window_end_iso: stats.window_end_iso,
    };
  }

  return summary;
}
