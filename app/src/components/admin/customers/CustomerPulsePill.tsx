'use client';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { cmStatusLabel, cmStatusTone } from '@/lib/admin/labels';
import { cn } from '@/lib/utils';

export function CustomerPulsePill({ 
  status, 
  detail 
}: {
  status: 'ok' | 'watch' | 'needs_action' | 'away';
  detail: { 
    lastPublishedAt: string | null; 
    lastCmActionAt: string | null; 
    pendingConcepts: number;
    barLabel?: string;
  };
}) {
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <span className="inline-flex cursor-default">
          <StatusPill label={cmStatusLabel(status)} tone={cmStatusTone(status)} size="xs" className="min-w-[70px] justify-center" />
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="right" className="w-72 p-3 text-xs shadow-xl border-border bg-popover/95 backdrop-blur-sm">
        <div className="space-y-2">
          <div className="flex justify-between gap-3 border-b border-border/50 pb-1.5 font-bold uppercase tracking-tight">
            <span>Operativ puls</span>
            <span className={cn("text-[10px]", cmStatusTone(status) === 'success' ? 'text-status-success-fg' : 'text-status-warning-fg')}>
              {cmStatusLabel(status)}
            </span>
          </div>
          <Row label="Senaste publicering" value={detail.lastPublishedAt ?? 'Ingen ännu'} />
          <Row label="Senaste CM-åtgärd"   value={detail.lastCmActionAt ?? 'Ingen registrerad'} />
          <Row label="Inplanerade koncept" value={String(detail.pendingConcepts)} />
          {detail.barLabel && <Row label="Veckans tempo" value={detail.barLabel} />}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground">{value}</span>
    </div>
  );
}
