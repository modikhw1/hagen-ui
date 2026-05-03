'use client';

import { useState } from 'react';
import { formatSek } from '@/lib/admin/money';
import type { OverviewDerivedPayload } from '@/lib/admin/overview-types';
import { apiClient } from '@/lib/admin/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/admin/queryKeys';
import { CostCard } from './CostCard';

function formatRefreshedAt(iso: string | null) {
  if (!iso) return 'Aldrig manuellt uppdaterat';
  try {
    return `Uppdaterad ${new Date(iso).toLocaleString('sv-SE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } catch {
    return 'Uppdaterad';
  }
}

export default function CostsGrid({
  costs,
}: {
  costs: OverviewDerivedPayload['costs'];
}) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      await apiClient.post('/api/admin/costs/refresh', {});
      await queryClient.invalidateQueries({ queryKey: qk.overview.all() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte uppdatera');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Kostnader</h2>
          <p className="text-xs text-muted-foreground">
            30-dagars utfall + prognos för innevarande månad · {formatRefreshedAt(costs.refreshedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-[11px] font-semibold uppercase tracking-wider rounded border border-border px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-border-strong disabled:opacity-50"
        >
          {refreshing ? 'Uppdaterar…' : 'Uppdatera'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {costs.entries.map((cost) => (
          <CostCard key={cost.service} cost={cost} />
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-4 py-3 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Totalt 30 d</span>
          <span className="text-lg font-bold text-foreground">{formatSek(costs.totalOre)}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-4 py-3 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Prognos månad slut
          </span>
          <span className="text-lg font-bold text-foreground">{formatSek(costs.projectedMonthOre)}</span>
        </div>
      </div>
    </section>
  );
}
