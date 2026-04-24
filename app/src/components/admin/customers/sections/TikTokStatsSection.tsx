'use client';

import { useMemo } from 'react';
import { Chart } from '@/components/admin/ui/chart/Chart';
import { LineSeries } from '@/components/admin/ui/chart/LineSeries';
import { AreaSeries } from '@/components/admin/ui/chart/AreaSeries';
import {
  CustomerRouteError,
  CustomerSection,
  CustomerSectionSkeleton,
} from '@/components/admin/customers/routes/shared';
import { useTikTokStats } from '@/hooks/admin/useCustomerTikTokStats';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TikTokStatsSection({ customerId }: { customerId: string }) {
  const { data: tiktok, isLoading, error } = useTikTokStats(customerId);

  if (isLoading) return <CustomerSectionSkeleton blocks={4} />;
  if (error) return <CustomerRouteError message={error.message} />;
  if (!tiktok) {
    return (
      <CustomerSection title="TikTok-statistik">
        <div className="rounded-md border border-border bg-secondary/20 px-4 py-8 text-center text-sm text-muted-foreground italic">
          Ingen TikTok-data tillgänglig för kunden än.
        </div>
      </CustomerSection>
    );
  }

  const followersData = (tiktok.follower_history_30d || []).map((y, x) => ({ x, y }));
  const viewsData = (tiktok.views_history_30d || []).map((y, x) => ({ x, y }));

  return (
    <CustomerSection title="TikTok-statistik">
      <div className="space-y-6">
        {/* Top 4 Stat Boxes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatBox 
            label="Följare" 
            value={tiktok.followers.toLocaleString('sv-SE')} 
            delta={tiktok.follower_delta_7d} 
            sub="7d" 
          />
          <StatBox 
            label="Snitt visningar" 
            value={Math.round(tiktok.avg_views_7d).toLocaleString('sv-SE')} 
            sub="7d" 
          />
          <StatBox 
            label="Engagement" 
            value={`${tiktok.engagement_rate.toFixed(1)}%`} 
          />
          <StatBox 
            label="Publicerade" 
            value={String(tiktok.total_videos)} 
            sub="totalt" 
          />
        </div>

        {/* Followers Chart */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between px-1">
            <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Följare (30d)</div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
               <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-primary inline-block rounded" /> Faktisk</span>
               <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-muted-foreground/30 inline-block rounded border-dashed" /> Trend</span>
            </div>
          </div>
          <div className="bg-secondary/30 rounded-lg p-4 border border-border/5">
            <Chart xDomain={[0, 30]} yDomain="auto" height={100}>
              <AreaSeries data={followersData} />
              <LineSeries data={followersData} smoothed strokeWidth={2} />
            </Chart>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-2 font-medium">
              <span>30d sedan</span>
              <span>Idag</span>
            </div>
          </div>
        </div>

        {/* Views Chart */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between px-1">
            <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Visningar (30d)</div>
          </div>
          <div className="bg-secondary/30 rounded-lg p-4 border border-border/5">
            <Chart xDomain={[0, 30]} yDomain="auto" height={80}>
              <LineSeries data={viewsData} color="hsl(var(--status-info-fg))" strokeWidth={2} />
            </Chart>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-2 font-medium">
              <span>30d sedan</span>
              <span>Idag</span>
            </div>
          </div>
        </div>

        {/* Growth Stats Row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-secondary/50 border border-border/5">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Följartillväxt 30d</div>
            <div className="flex items-center gap-2">
              <DeltaIndicator delta={tiktok.follower_delta_30d} />
              <span className="text-base text-foreground font-bold">
                {tiktok.follower_delta_30d > 0 ? "+" : ""}{tiktok.follower_delta_30d}%
              </span>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-secondary/50 border border-border/5">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Snitt visningar 30d</div>
            <span className="text-base text-foreground font-bold">
               {Math.round(tiktok.avg_views_30d || 0).toLocaleString('sv-SE')}
            </span>
          </div>
        </div>
      </div>
    </CustomerSection>
  );
}

function StatBox({ label, value, delta, sub }: { label: string; value: string; delta?: number; sub?: string }) {
  return (
    <div className="p-4 rounded-lg bg-secondary/50 border border-border/5 shadow-sm">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-foreground">{value}</span>
        {delta !== undefined && <DeltaIndicator delta={delta} />}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-1 font-medium">{sub}</div>}
    </div>
  );
}

function DeltaIndicator({ delta }: { delta: number }) {
  if (delta > 0) return <TrendingUp className="h-4 w-4 text-status-success-fg" />;
  if (delta < 0) return <TrendingDown className="h-4 w-4 text-status-danger-fg" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}
