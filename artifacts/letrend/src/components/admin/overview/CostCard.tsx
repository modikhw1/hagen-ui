'use client';

import { formatSek } from '@/lib/admin/money';
import { Sparkline } from '@/components/admin/ui/chart/Sparkline';

export type CostEntry = {
  service: string;
  calls_30d: number;
  cost_30d: number;
  projected_month_ore?: number | null;
  data_source?: 'measured' | 'estimated' | 'missing';
  trend: number[];
  quota?: {
    used: number;
    limit: number;
    reset_at: string | null;
    debug_msg?: string;
  } | null;
};

const BADGE_TEXT: Record<NonNullable<CostEntry['data_source']>, { label: string; cls: string }> = {
  measured: { label: 'Mätt', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  estimated: { label: 'Uppskattat', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  missing: { label: 'Saknar data', cls: 'bg-muted text-muted-foreground' },
};

export function CostCard({ cost }: { cost: CostEntry }) {
  const percentage = cost.quota
    ? cost.quota.limit > 0 ? Math.min(100, Math.round((cost.quota.used / cost.quota.limit) * 100)) : 0
    : null;

  const source = cost.data_source ?? 'missing';
  const badge = BADGE_TEXT[source];
  const showActual = source !== 'missing';
  const showProjection = source !== 'missing' && cost.projected_month_ore != null;

  return (
    <div className="group flex flex-col rounded-lg border border-border bg-card overflow-hidden transition-all hover:border-border-strong hover:shadow-sm">
      <div className="p-3 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            {cost.service}
          </div>
          <span className={`text-[9px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${badge.cls}`}>
            {badge.label}
          </span>
        </div>

        {showActual ? (
          <>
            <div className="mt-1 flex items-baseline gap-2">
              <div className="text-base font-bold text-foreground">
                {formatSek(cost.cost_30d)}
              </div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">30 d</span>
            </div>
            {showProjection && (
              <div className="mt-0.5 flex items-baseline gap-2">
                <div className="text-xs font-semibold text-muted-foreground">
                  {formatSek(cost.projected_month_ore ?? 0)}
                </div>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">prognos mån</span>
              </div>
            )}
          </>
        ) : (
          <div className="mt-1 text-xs italic text-muted-foreground">
            Ingen mätning ännu — se audit-rapport
          </div>
        )}

        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{cost.calls_30d.toLocaleString('sv-SE')} anrop</span>
          {cost.quota && (
            <div className="flex items-center gap-1">
              {percentage !== null && (
                <span className={percentage > 85 ? 'text-destructive font-bold' : ''}>
                  {percentage}% kvot
                </span>
              )}
              {cost.quota.debug_msg && (
                <span className="opacity-30 text-[8px] font-mono">
                  [{cost.quota.debug_msg === 'ERR_HTTP_429' ? 'Rate Limited' : cost.quota.debug_msg}]
                </span>
              )}
            </div>
          )}
        </div>

        {percentage !== null && (
          <div className="mt-1.5 h-1 w-full bg-secondary/30 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                percentage > 90 ? 'bg-destructive' : percentage > 70 ? 'bg-amber-500' : 'bg-primary'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>
      {cost.trend && cost.trend.length > 0 && (
        <div className="bg-secondary/10 px-1 py-1 border-t border-border/50">
          <Sparkline
            data={cost.trend}
            height={28}
            className="opacity-40 group-hover:opacity-100 transition-opacity"
          />
        </div>
      )}
    </div>
  );
}
