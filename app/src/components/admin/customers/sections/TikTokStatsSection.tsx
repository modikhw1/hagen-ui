'use client';

import { useMemo } from 'react';
import { Chart } from '@/components/admin/ui/chart/Chart';
import { LineSeries } from '@/components/admin/ui/chart/LineSeries';
import { AreaSeries } from '@/components/admin/ui/chart/AreaSeries';
import { ScatterSeries } from '@/components/admin/ui/chart/ScatterSeries';
import { Threshold } from '@/components/admin/ui/chart/Threshold';
import {
  CustomerMetricCard,
  CustomerRouteError,
  CustomerSection,
  CustomerSectionSkeleton,
} from '@/components/admin/customers/routes/shared';
import { useTikTokStats } from '@/hooks/admin/useCustomerTikTokStats';
import { getLikeRateTier, getSuccessThresholds } from '@/lib/customer-detail/success';

export default function TikTokStatsSection({ customerId }: { customerId: string }) {
  const { data: tiktok, isLoading, error } = useTikTokStats(customerId);

  if (isLoading) return <CustomerSectionSkeleton blocks={4} />;
  if (error) return <CustomerRouteError message={error.message} />;
  if (!tiktok) {
    return (
      <CustomerSection title="TikTok">
        <div className="rounded-md border border-border bg-secondary/20 px-4 py-4 text-sm text-muted-foreground">
          Ingen TikTok-data hittades för kunden än.
        </div>
      </CustomerSection>
    );
  }

  const thresholds = getSuccessThresholds(tiktok.followers);
  const recentVideos = tiktok.recent_videos ?? [];
  const meanViews30d = recentVideos.length
    ? Math.round(recentVideos.reduce((sum, video) => sum + video.views, 0) / recentVideos.length)
    : 0;
  const viralCount = recentVideos.filter((video) => video.views >= thresholds.viral).length;
  const hitCount = recentVideos.filter((video) => video.views >= thresholds.hit).length;
  
  const totalLikes = recentVideos.reduce((sum, video) => sum + video.likes, 0);
  const totalViews = recentVideos.reduce((sum, video) => sum + video.views, 0);
  const likeRate = totalViews > 0 ? (totalLikes / totalViews) * 100 : 0;
  const likeTier = getLikeRateTier(likeRate);

  const followersData = (tiktok.follower_history_30d || []).map((y, x) => ({ x, y }));
  
  const scatterPoints = recentVideos.map((v) => {
    const pubDate = new Date(v.uploaded_at);
    const windowEnd = new Date(tiktok.window_end_iso);
    const diffDays = (windowEnd.getTime() - pubDate.getTime()) / (1000 * 3600 * 24);
    return {
      x: 30 - diffDays,
      y: v.views,
      ...v
    };
  });

  return (
    <CustomerSection title="TikTok">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <CustomerMetricCard
            label="7d snitt"
            value={Math.round(tiktok.avg_views_7d).toLocaleString('sv-SE')}
            sub={`${tiktok.follower_delta_7d > 0 ? '+' : ''}${tiktok.follower_delta_7d}% vs förra veckan`}
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

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Videor (30d)
              </div>
              <div className="text-[10px] text-muted-foreground italic">
                Hit {thresholds.hit.toLocaleString('sv-SE')} · Viral{' '}
                {thresholds.viral.toLocaleString('sv-SE')}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/10 p-4">
              <Chart xDomain={[0, 30]} yDomain="auto" height={140}>
                <Threshold y={thresholds.hit} label="Hit" />
                <Threshold y={thresholds.viral} label="Viral" color="hsl(var(--status-danger-fg))" />
                <ScatterSeries
                  points={scatterPoints}
                  color={(p) => p.y >= thresholds.viral ? 'hsl(var(--chart-point-viral))' : p.y >= thresholds.hit ? 'hsl(var(--chart-point-hit))' : 'hsl(var(--chart-point-default))'}
                  radius={(p) => Math.max(3, Math.min(8, p.y / 20000))}
                />
              </Chart>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Följare (30d)
              </div>
              <div className="text-[10px] font-semibold text-foreground">
                {tiktok.followers.toLocaleString('sv-SE')}
                <span className="ml-1.5 text-status-success-fg">
                  {tiktok.follower_delta_30d > 0 ? '+' : ''}{tiktok.follower_delta_30d}%
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/10 p-4">
              <Chart xDomain={[0, 30]} yDomain="auto" height={140}>
                <AreaSeries data={followersData} />
                <LineSeries data={followersData} smoothed />
              </Chart>
            </div>
          </div>
        </div>
      </div>
    </CustomerSection>
  );
}
