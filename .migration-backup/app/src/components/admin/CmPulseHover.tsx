'use client';

import { cmStatusLabel } from '@/lib/admin/labels';
import { Info } from 'lucide-react';
import { Tooltip } from '@mantine/core';

export default function CmPulseHover({
  aggregate,
}: {
  aggregate: any;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-2">
        <div className="flex items-center gap-1.5">
          <div className="text-sm font-bold text-foreground uppercase tracking-tight">CM-puls</div>
          <Tooltip 
            label="Rekommendation för att ligga i fas: Ha alltid fler koncept inplanerade än veckotempot. T.ex: Tempo 2 -> 3-4 koncept. Se även till att datum flyttas fram om kunden inte filmar i tid."
            multiline
            w={220}
            withArrow
            position="top"
          >
            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
          </Tooltip>
        </div>
        <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
          {cmStatusLabel(aggregate.status as any)}
        </span>
      </div>

      <div className="space-y-1.5 text-xs">
        {aggregate.activeAbsence ? (
          <Row
            label="Frånvaro"
            value={`${aggregate.activeAbsence.startsOn} - ${aggregate.activeAbsence.endsOn}`}
          />
        ) : null}
        <Row 
          label="Veckans tempo" 
          value={aggregate.barLabel} 
          highlight={aggregate.planned_concepts_total < aggregate.expected_concepts_7d} 
          danger={aggregate.planned_concepts_total < (aggregate.expected_concepts_7d * 0.5)}
        />
        <Row 
          label="Senaste interaktion" 
          value={
            aggregate.lastInteractionAt 
              ? (aggregate.last_interaction_days === 0 ? 'Idag' : `${aggregate.last_interaction_days} dagar sedan`)
              : 'Väntar på uppstart'
          } 
        />
        <div className="pt-2 space-y-1.5 border-t border-border/50 mt-1">
          <Row label="Under planerat tempo" value={String(aggregate.counts.n_under)} highlight={aggregate.counts.n_under > 0} danger={aggregate.counts.n_under > 0} />
          <Row label="Behöver planera framåt" value={String(aggregate.counts.n_thin)} highlight={aggregate.counts.n_thin > 0} />
          <Row label="Väntar på kunden"     value={String(aggregate.counts.n_blocked)} />
        </div>
      </div>

      {aggregate.newCustomers && aggregate.newCustomers.length > 0 && (
        <div className="border-t border-border/50 pt-2.5">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Nya kunder</div>
          <div className="space-y-1.5">
            {aggregate.newCustomers.map((customer: any) => (
              <div key={customer.id} className="flex justify-between gap-3 text-[11px]">
                <span className="truncate text-foreground font-medium">{customer.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {customer.onboardingState === 'cm_ready' ? 'CM redo' : 'Inbjuden'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {aggregate.activeAbsence?.backupCmName ? (
        <div className="rounded-md border border-border bg-status-info-bg/10 px-3 py-2 text-[11px] text-status-info-fg">
          Aktiv coverage via {aggregate.activeAbsence.backupCmName}.
        </div>
      ) : null}
    </div>
  );
}

function Row({ 
  label, 
  value, 
  highlight,
  danger 
}: { 
  label: string; 
  value: string; 
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-semibold ${
        danger ? 'text-status-danger-fg' : highlight ? 'text-status-warning-fg' : 'text-foreground'
      }`}>
        {value}
      </span>
    </div>
  );
}
