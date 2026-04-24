'use client';

import { formatSek } from '@/lib/admin/money';
import type { OverviewDerivedPayload } from '@/lib/admin/overview-types';
import { Sparkline } from '@/components/admin/ui/chart/Sparkline';

export default function CostsGrid({
  costs,
}: {
  costs: OverviewDerivedPayload['costs'];
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Kostnader</h2>
        <p className="text-xs text-muted-foreground">30-dagars historik per tjänst</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {costs.entries.map((cost) => (
          <div key={cost.service} className="group flex flex-col rounded-lg border border-border bg-card overflow-hidden">
            <div className="p-3 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                {cost.service}
              </div>
              <div className="mt-1 text-base font-bold text-foreground">
                {cost.cost_30d === 0 ? 'Gratis' : formatSek(cost.cost_30d)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {cost.calls_30d.toLocaleString('sv-SE')} anrop
              </div>
            </div>
            {cost.trend && cost.trend.length > 0 && (
              <div className="bg-secondary/10 px-1 py-1 border-t border-border/50">
                <Sparkline data={cost.trend} height={28} className="opacity-40 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-4 py-3 shadow-sm">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Totalt 30d</div>
        <div className="text-lg font-bold text-foreground">{formatSek(costs.totalOre)}</div>
      </div>
    </div>
  );
}
