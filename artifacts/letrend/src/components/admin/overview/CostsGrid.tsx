'use client';

import { formatSek } from '@/lib/admin/money';
import type { OverviewDerivedPayload } from '@/lib/admin/overview-types';
import { CostCard } from './CostCard';

export default function CostsGrid({
  costs,
}: {
  costs: OverviewDerivedPayload['costs'];
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Kostnader</h2>
        <p className="text-xs text-muted-foreground">30-dagars historik per tjänst</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {costs.entries.map((cost) => (
          <CostCard key={cost.service} cost={cost} />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-4 py-3 shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Totalt 30d</span>
        <span className="text-lg font-bold text-foreground">{formatSek(costs.totalOre)}</span>
      </div>
    </section>
  );
}
