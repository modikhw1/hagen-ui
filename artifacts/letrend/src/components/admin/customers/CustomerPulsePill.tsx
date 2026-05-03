'use client';

import { HoverCard, Text, Box, Group } from '@mantine/core';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { cmStatusLabel, cmStatusTone } from '@/lib/admin/labels';
import { cn } from '@/lib/utils';

export function CustomerPulsePill({ 
  status, 
  detail,
  reason
}: {
  status: 'ok' | 'stagnant' | 'needs_action' | 'resting';
  reason?: string;
  detail: { 
    lastPublishedAt: string | null; 
    lastCmActionAt: string | null; 
    pendingConcepts: number;
    barLabel?: string;
  };
}) {
  const tone = cmStatusTone(status as any);
  const label = cmStatusLabel(status as any);

  return (
    <HoverCard width={288} position="right" shadow="md" openDelay={200}>
      <HoverCard.Target>
        <span className="inline-flex cursor-default">
          <StatusPill label={label} tone={tone} size="xs" className="min-w-[85px] justify-center" />
        </span>
      </HoverCard.Target>
      <HoverCard.Dropdown p="sm">
        <div className="space-y-2 text-xs">
          <div className="flex justify-between gap-3 border-b border-border/50 pb-1.5 font-bold uppercase tracking-tight">
            <span>Operativ puls</span>
            <span className={cn("text-[10px]", 
              tone === 'success' ? 'text-green-600' : 
              tone === 'danger' ? 'text-red-600' : 
              tone === 'warning' ? 'text-orange-600' : 
              'text-muted-foreground'
            )}>
              {label}
            </span>
          </div>
          
          {reason && (
            <div className="rounded bg-muted/30 p-1.5 font-medium text-foreground">
              {reason}
            </div>
          )}

          <div className="pt-1 space-y-1">
            <Row label="Senaste publicering" value={detail.lastPublishedAt ?? 'Ingen ännu'} />
            <Row label="Senaste CM-åtgärd"   value={detail.lastCmActionAt ?? 'Ingen registrerad'} />
            <Row label="Inplanerade koncept" value={String(detail.pendingConcepts)} />
            {detail.barLabel && <Row label="Veckans tempo" value={detail.barLabel} />}
          </div>
        </div>
      </HoverCard.Dropdown>
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
