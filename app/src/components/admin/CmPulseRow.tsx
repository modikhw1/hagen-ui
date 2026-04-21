'use client';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import type { cmAggregate } from '@/lib/admin-derive/cm-pulse';
import AdminAvatar from './AdminAvatar';
import CmPulseHover from './CmPulseHover';

export default function CmPulseRow({
  name,
  avatarUrl,
  aggregate,
}: {
  name: string;
  avatarUrl: string | null;
  aggregate: ReturnType<typeof cmAggregate>;
}) {
  const toneClass = aggregate.status === 'needs_action'
    ? 'text-destructive'
    : aggregate.status === 'watch'
      ? 'text-warning'
      : 'text-success';

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="flex cursor-pointer items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/20">
          <AdminAvatar name={name} avatarUrl={avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">{name}</div>
            <div className="text-xs text-muted-foreground">
              {aggregate.counts.n_ok} i fas · {aggregate.counts.n_thin + aggregate.counts.n_under} behöver mer buffer
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="flex flex-col items-end gap-1">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-accent">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(aggregate.fillPct, 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-muted-foreground">{aggregate.barLabel}</div>
            </div>
            <span className={`text-[11px] font-semibold ${toneClass}`}>
              {aggregate.status === 'needs_action' ? 'Behöver åtgärd' : aggregate.status === 'watch' ? 'Bevaka' : 'I fas'}
            </span>
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={10}
        avoidCollisions
        collisionPadding={16}
        className="w-[min(22rem,calc(100vw-2rem))] p-4"
      >
        <CmPulseHover aggregate={aggregate} />
      </HoverCardContent>
    </HoverCard>
  );
}
