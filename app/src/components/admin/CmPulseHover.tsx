'use client';

import { timeAgoSv } from '@/lib/admin/time';
import type { cmAggregate } from '@/lib/admin-derive/cm-pulse';

export default function CmPulseHover({
  aggregate,
}: {
  aggregate: ReturnType<typeof cmAggregate>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">CM-puls</div>
        <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {aggregate.status === 'needs_action' ? 'Behöver åtgärd' : aggregate.status === 'watch' ? 'Bevaka' : 'I fas'}
        </span>
      </div>

      <div className="space-y-1 text-xs">
        <Row label="Veckans tempo" value={aggregate.barLabel} />
        <Row label="Senaste interaktion" value={`${aggregate.last_interaction_days} dagar sedan`} />
        <Row label="Tunna kunder" value={String(aggregate.counts.n_thin)} />
        <Row label="Under mål" value={String(aggregate.counts.n_under)} />
        <Row label="Blockerad av kund" value={String(aggregate.counts.n_blocked)} />
      </div>

      {aggregate.recentPublications.length > 0 && (
        <div className="border-t border-border pt-2">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Senaste publiceringar</div>
          <div className="space-y-1">
            {aggregate.recentPublications.map((customer) => (
              <div key={customer.id} className="flex justify-between gap-3 text-xs">
                <span className="truncate text-foreground">{customer.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {customer.lastPublishedAt ? timeAgoSv(customer.lastPublishedAt.toISOString()) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {aggregate.newCustomers.length > 0 && (
        <div className="border-t border-border pt-2">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Nya kunder</div>
          <div className="space-y-1">
            {aggregate.newCustomers.map((customer) => (
              <div key={customer.id} className="flex justify-between gap-3 text-xs">
                <span className="truncate text-foreground">{customer.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {customer.onboardingState === 'cm_ready' ? 'CM redo' : 'Inviterad'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
