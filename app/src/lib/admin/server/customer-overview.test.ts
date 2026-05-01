import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildCustomerTikTokStats } from '@/lib/admin/server/customer-overview';

describe('buildCustomerTikTokStats', () => {
  it('returns null when no stats rows exist', () => {
    expect(
      buildCustomerTikTokStats({
        statsRows: [],
        recentVideos: [],
      }),
    ).toBeNull();
  });

  it('normalizes follower gaps and derives the overview payload', () => {
    const payload = buildCustomerTikTokStats({
      statsRows: [
        {
          snapshot_date: '2026-04-01',
          followers: 100,
          total_videos: 20,
          videos_last_24h: 1,
          total_views_24h: 1000,
          engagement_rate: 4.2,
        },
        {
          snapshot_date: '2026-04-02',
          followers: 0,
          total_videos: 21,
          videos_last_24h: 2,
          total_views_24h: 2000,
          engagement_rate: 4.5,
        },
        {
          snapshot_date: '2026-04-03',
          followers: 160,
          total_videos: 22,
          videos_last_24h: 1,
          total_views_24h: 500,
          engagement_rate: 4.8,
        },
      ],
      recentVideos: [
        {
          video_id: 'vid_1',
          uploaded_at: '2026-04-03T09:00:00.000Z',
          views: 1200,
          likes: 80,
          comments: 7,
          shares: 4,
          share_url: 'https://example.com/video/1',
          description: 'Example video',
          cover_image_url: null,
        },
      ],
    });

    expect(payload).toMatchObject({
      followers: 160,
      follower_delta_7d: 60,
      follower_delta_30d: 60,
      avg_views_7d: 1167,
      avg_views_30d: 1167,
      engagement_rate: 4.8,
      total_videos: 22,
      videos_last_7d: 4,
      follower_history_30d: [100, 100, 160],
      snapshot_dates_30d: ['2026-04-01', '2026-04-02', '2026-04-03'],
      window_end_iso: '2026-04-03T12:00:00.000Z',
    });
    expect(payload?.recent_videos).toHaveLength(1);
  });
});
