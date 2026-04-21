'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { DollarSign, Send, TrendingUp, UserCheck } from 'lucide-react';
import AttentionList from '@/components/admin/AttentionList';
import CmPulseRow from '@/components/admin/CmPulseRow';
import { useOverviewData } from '@/hooks/admin/useOverviewData';
import { type SortMode } from '@/lib/admin-derive/cm-pulse';
import { CM_PREVIEW_COUNT } from '@/lib/admin-derive/constants';
import { deriveOverview } from '@/lib/admin/overview-derive';
import { formatSek } from '@/lib/admin/money';

export default function AdminOverviewPage() {
  const { data, isLoading, error } = useOverviewData();
  const [cmExpanded, setCmExpanded] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('standard');

  const derived = useMemo(() => {
    if (!data) return null;
    return deriveOverview(data, { sortMode });
  }, [data, sortMode]);

  if (isLoading) return <div className="text-sm text-muted-foreground">Laddar oversikt...</div>;
  if (error || !data || !derived) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Kunde inte ladda oversikten.
      </div>
    );
  }

  const visibleCMs = cmExpanded
    ? derived.sortedCmRows
    : derived.sortedCmRows.slice(0, CM_PREVIEW_COUNT);
  const hasMoreCMs = derived.sortedCmRows.length > CM_PREVIEW_COUNT;
  const visibleCostEntries = derived.costEntries;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mt-0 font-heading text-2xl font-bold text-foreground">Oversikt</h1>
        <p className="mt-1 text-sm text-muted-foreground">Operativt tillstand</p>
      </div>

      <section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon={<DollarSign className="h-4 w-4" />} card={derived.revenueCard} />
          <MetricCard icon={<UserCheck className="h-4 w-4" />} card={derived.activeCard} />
          <MetricCard icon={<Send className="h-4 w-4" />} card={derived.demosCard} href="/admin/demos" />
          <MetricCard icon={<TrendingUp className="h-4 w-4" />} card={derived.costsCard} />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-sm font-semibold text-foreground">CM-puls</h2>
          <span className="text-xs text-muted-foreground">Senaste 7 dagarna</span>
          <div className="flex-1" />
          <button
            onClick={() =>
              setSortMode((mode) =>
                mode === 'standard' ? 'lowest_activity' : 'standard',
              )
            }
            className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {sortMode === 'lowest_activity'
              ? 'Avvikande aktivitet forst'
              : 'Standard'}
          </button>
        </div>
        <div className="space-y-2">
          {visibleCMs.map((row) => (
            <CmPulseRow
              key={row.member.id}
              name={row.member.name}
              avatarUrl={row.member.avatar_url}
              aggregate={row.aggregate}
            />
          ))}
        </div>
        {hasMoreCMs && (
          <button
            onClick={() => setCmExpanded((value) => !value)}
            className="mt-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {cmExpanded
              ? 'Visa farre'
              : `Visa alla ${derived.sortedCmRows.length} CMs`}
          </button>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-sm font-semibold text-foreground">Kraver uppmarksamhet</h2>
          <span className="text-xs text-muted-foreground">Sorterad enligt operativ modell</span>
        </div>
        <AttentionList items={derived.attentionItems} />
      </section>

      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-sm font-semibold text-foreground">Hanteras nu</h2>
          <span className="text-xs text-muted-foreground">
            Slapp markering direkt fran overviewn
          </span>
        </div>
        <AttentionList
          items={derived.snoozedAttentionItems}
          mode="snoozed"
          emptyLabel="Inga aktiva hanteras-markeringar."
        />
      </section>

      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-sm font-semibold text-foreground">Kostnader</h2>
          <span className="text-xs text-muted-foreground">30 dagar</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {visibleCostEntries.map((cost) => (
            <div key={cost.service} className="rounded-lg border border-border bg-card p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {cost.service}
              </div>
              <div className="mt-2 text-base font-bold text-foreground">
                {cost.cost_30d > 0
                  ? `${Math.round(cost.cost_30d).toLocaleString('sv-SE')} kr`
                  : 'Gratis'}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {cost.calls_30d.toLocaleString('sv-SE')} anrop
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-border bg-secondary/50 p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Totalt
            </div>
            <div className="mt-2 text-base font-bold text-foreground">
              {formatSek(Math.round(data.serviceCosts.total * 100))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  card,
  href,
}: {
  icon: React.ReactNode;
  card: {
    label: string;
    value: string;
    sub?: string;
    delta?: { text: string; tone: 'success' | 'muted' | 'destructive' };
  };
  href?: string;
}) {
  const content = (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-4">
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {card.label}
        </div>
        <div className="text-base font-bold text-foreground">{card.value}</div>
        {card.sub && <div className="text-[11px] text-muted-foreground">{card.sub}</div>}
      </div>
      {card.delta && (
        <div
          className={`text-[11px] font-semibold ${
            card.delta.tone === 'success'
              ? 'text-success'
              : card.delta.tone === 'destructive'
                ? 'text-destructive'
                : 'text-muted-foreground'
          }`}
        >
          {card.delta.text}
        </div>
      )}
    </div>
  );

  if (!href) return content;
  return <Link href={href}>{content}</Link>;
}
