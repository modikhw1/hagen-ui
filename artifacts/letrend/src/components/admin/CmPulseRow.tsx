'use client';

import { HoverCard } from '@mantine/core';
import AdminAvatar from './AdminAvatar';
import CmPulseHover from './CmPulseHover';
import { cmStatusLabel, cmStatusTone } from '@/lib/admin/labels';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { cmColorVar } from '@/lib/admin/teamPalette';
import { cn } from '@/lib/utils';
import { timeAgoSv } from '@/lib/admin/time';

export default function CmPulseRow({
  name,
  avatarUrl,
  aggregate,
}: {
  name: string;
  avatarUrl: string | null;
  aggregate: any;
}) {
  const tone = cmStatusTone(aggregate.status as any);
  const label = cmStatusLabel(aggregate.status as any);
  const warningCount = aggregate.counts.n_under + aggregate.counts.n_blocked;
  const reviewCount = aggregate.counts.n_thin;

  return (
    <HoverCard openDelay={200} closeDelay={100} position="bottom" offset={10} shadow="xl">
      <HoverCard.Target>
        <div className="flex cursor-pointer items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/10">
          <AdminAvatar 
            name={name} 
            avatarUrl={avatarUrl} 
            size="lg" 
            fallbackColor={`hsl(var(--${cmColorVar(aggregate.cmId)}))`} 
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">{name}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn(aggregate.counts.n_ok > 0 && "text-status-success-fg font-medium")}>
                {aggregate.counts.n_ok} i fas
              </span>
              {warningCount > 0 && (
                <span className="flex items-center gap-1 text-status-danger-fg font-medium">
                  · {warningCount} {warningCount === 1 ? 'varningsflagga' : 'varningsflaggor'}
                </span>
              )}
              {reviewCount > 0 && warningCount === 0 && (
                <span className="flex items-center gap-1 text-status-warning-fg font-medium">
                  · {reviewCount} att se över
                </span>
              )}
              <span>· {aggregate.totalCustomers} { aggregate.totalCustomers === 1 ? 'kund' : 'kunder'}</span>
            </div>
            {aggregate.lastInteractionAt ? (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                Senaste åtgärd: {timeAgoSv(aggregate.lastInteractionAt)}
              </div>
            ) : (
              <div className="mt-0.5 text-[10px] text-status-warning-fg/80 italic">
                Ingen åtgärd loggad än
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-6 shrink-0">
            {aggregate.totalCustomers > 0 && (
              <div className="hidden sm:flex flex-col items-center gap-1 w-20">
                {/* Progress bar container */}
                <div className="h-1 w-full overflow-hidden rounded-full bg-accent/30">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all"
                    style={{ width: `${Math.min(aggregate.fillPct, 100)}%` }}
                  />
                </div>
                {/* x/y text label */}
                <div className="text-[10px] leading-none text-muted-foreground tabular-nums tracking-tight">
                  {aggregate.barLabel}
                </div>
              </div>
            )}
            <StatusPill tone={tone} label={label} size="xs" className="w-[100px] justify-center" />
          </div>
        </div>
      </HoverCard.Target>
      <HoverCard.Dropdown
        className="w-[min(22rem,calc(100vw-2rem))] p-4 border-border bg-popover/95 backdrop-blur-sm"
      >
        <CmPulseHover aggregate={aggregate} />
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
