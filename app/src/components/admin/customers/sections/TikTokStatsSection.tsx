'use client';

import { useMemo } from 'react';
import { ChartSVG, smoothData, ViewsScatterChart } from '@/components/admin/customers/ChartSVG';
import { useTikTokStats } from '@/hooks/admin/useCustomerTikTokStats';
import { getLikeRateTier, getSuccessThresholds } from '@/lib/customer-detail/success';
import {
  CustomerMetricCard,
  CustomerRouteError,
  CustomerSectionSkeleton,
  CustomerSection,
} from '@/components/admin/customers/routes/shared';

export default function TikTokStatsSection({ customerId }: { customerId: string }) {
  const { data: tiktok, isLoading, error } = useTikTokStats(customerId);
  const followerSmoothed = useMemo(
    () => (tiktok ? smoothData(tiktok.follower_history_30d, 7) : []),
    [tiktok],
  );

  if (isLoading) {
    return <CustomerSectionSkeleton blocks={4} />;
  }

  if (error) {
    return <CustomerRouteError message={error.message} />;
  }

  const thresholds = tiktok ? getSuccessThresholds(tiktok.followers) : null;
  const recentVideos = tiktok?.recent_videos ?? [];
  const meanViews30d = recentVideos.length
    ? Math.round(recentVideos.reduce((sum, video) => sum + video.views, 0) / recentVideos.length)
    : 0;
  const viralCount = thresholds
    ? recentVideos.filter((video) => video.views >= thresholds.viral).length
    : 0;
  const hitCount = thresholds
    ? recentVideos.filter((video) => video.views >= thresholds.hit).length
    : 0;
  const totalLikes = recentVideos.reduce((sum, video) => sum + video.likes, 0);
  const totalViews = recentVideos.reduce((sum, video) => sum + video.views, 0);
  const likeRate = totalViews > 0 ? (totalLikes / totalViews) * 100 : 0;
  const likeTier = getLikeRateTier(likeRate);

  return (
    <CustomerSection title="TikTok">
      {tiktok ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <CustomerMetricCard
              label="7d snitt"
              value={Math.round(tiktok.avg_views_7d).toLocaleString('sv-SE')}
              sub={`${tiktok.follower_delta_7d > 0 ? '+' : ''}${tiktok.follower_delta_7d}% vs forra veckan`}
              emphasis={tiktok.avg_views_7d > 0 ? 'success' : 'default'}
            />
            <CustomerMetricCard
              label="30d snitt"
              value={meanViews30d.toLocaleString('sv-SE')}
              sub={`${hitCount} hits · ${viralCount} virala`}
            />
            <CustomerMetricCard
              label="Engagement"
              value={`${tiktok.engagement_rate.toFixed(1)}%`}
              sub={`${tiktok.total_videos} videor totalt`}
            />
            <CustomerMetricCard
              label="Like rate"
              value={`${likeRate.toFixed(1)}%`}
              sub={likeTier}
              emphasis={likeTier}
            />
          </div>

          {thresholds ? (
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Videor senaste 30 dagarna
                  </div>
                  <div className="text-[10px] italic text-muted-foreground">
                    Hit {thresholds.hit.toLocaleString('sv-SE')} · Viral{' '}
                    {thresholds.viral.toLocaleString('sv-SE')}
                  </div>
                </div>
                <div className="rounded-lg bg-secondary/30 p-3">
                  <ViewsScatterChart
                    videos={recentVideos}
                    hitThreshold={thresholds.hit}
                    viralThreshold={thresholds.viral}
                    windowEndIso={tiktok.window_end_iso}
                  />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Foljare (30d) · {tiktok.followers.toLocaleString('sv-SE')}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {tiktok.follower_delta_30d > 0 ? '+' : ''}
                    {tiktok.follower_delta_30d}%
                  </div>
                </div>
                <div className="rounded-lg bg-secondary/30 p-3">
                  <ChartSVG
                    data={tiktok.follower_history_30d}
                    smoothed={followerSmoothed}
                    height={50}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-md border border-border bg-secondary/20 px-4 py-4 text-sm text-muted-foreground">
          Ingen TikTok-data hittades for kunden an.
        </div>
      )}
    </CustomerSection>
  );
}
