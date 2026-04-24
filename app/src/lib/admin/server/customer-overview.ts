import 'server-only';

import { unstable_cache } from 'next/cache';
import { adminCustomerTag } from '@/lib/admin/cache-tags';
import { tikTokStatsSchema, type TikTokStats } from '@/lib/admin/dtos/customer';
import { isMissingRelationError } from '@/lib/admin/schema-guards';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

type TikTokStatsSnapshotRow = {
  snapshot_date: string;
  followers: number;
  total_videos: number;
  videos_last_24h: number;
  total_views_24h: number;
  engagement_rate: number;
};

type TikTokVideoRow = {
  video_id: string;
  uploaded_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  share_url: string | null;
  cover_image_url: string | null;
};

function carryForwardFollowers(rows: TikTokStatsSnapshotRow[]) {
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

export async function fetchCustomerTikTokStatsServer(id: string): Promise<TikTokStats | null> {
  return unstable_cache(
    async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const cutoffIso = `${cutoff}T00:00:00.000Z`;
      const supabaseAdmin = createSupabaseAdmin();
      const [statsResult, videosResult] = await Promise.all([
        supabaseAdmin
          .from('tiktok_stats')
          .select(
            'snapshot_date, followers, total_videos, videos_last_24h, total_views_24h, engagement_rate',
          )
          .eq('customer_profile_id', id)
          .gte('snapshot_date', cutoff)
          .order('snapshot_date', { ascending: true }),
        supabaseAdmin
          .from('tiktok_videos')
          .select(
            'video_id, uploaded_at, views, likes, comments, shares, share_url, cover_image_url',
          )
          .eq('customer_profile_id', id)
          .gte('uploaded_at', cutoffIso)
          .order('uploaded_at', { ascending: true }),
      ]);

      if (statsResult.error) {
        if (isMissingRelationError(statsResult.error.message)) {
          return null;
        }

        throw new Error(statsResult.error.message || 'Kunde inte ladda TikTok-statistik');
      }

      if (videosResult.error) {
        if (isMissingRelationError(videosResult.error.message)) {
          return buildCustomerTikTokStats({
            statsRows: (statsResult.data ?? []).map((row) => ({
              snapshot_date: String(row.snapshot_date),
              followers: Number(row.followers ?? 0),
              total_videos: Number(row.total_videos ?? 0),
              videos_last_24h: Number(row.videos_last_24h ?? 0),
              total_views_24h: Number(row.total_views_24h ?? 0),
              engagement_rate: Number(row.engagement_rate ?? 0),
            })),
            recentVideos: [],
          });
        }

        throw new Error(videosResult.error.message || 'Kunde inte ladda TikTok-videor');
      }

      const statsRows = (statsResult.data ?? []).map((row) => ({
        snapshot_date: String(row.snapshot_date),
        followers: Number(row.followers ?? 0),
        total_videos: Number(row.total_videos ?? 0),
        videos_last_24h: Number(row.videos_last_24h ?? 0),
        total_views_24h: Number(row.total_views_24h ?? 0),
        engagement_rate: Number(row.engagement_rate ?? 0),
      }));
      const recentVideos = (videosResult.data ?? []).map((video) => ({
        video_id: String(video.video_id ?? ''),
        uploaded_at: String(video.uploaded_at ?? ''),
        views: Number(video.views ?? 0),
        likes: Number(video.likes ?? 0),
        comments: Number(video.comments ?? 0),
        shares: Number(video.shares ?? 0),
        share_url: typeof video.share_url === 'string' ? video.share_url : null,
        cover_image_url: typeof video.cover_image_url === 'string' ? video.cover_image_url : null,
      }));

      return buildCustomerTikTokStats({
        statsRows,
        recentVideos,
      });
    },
    ['admin-customer-tiktok-stats-rsc', id],
    {
      revalidate: 300,
      tags: [adminCustomerTag(id)],
    },
  )();
}
