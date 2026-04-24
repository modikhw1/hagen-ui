'use client';

import { useState } from 'react';
import ActivityDotMatrix from '@/components/admin/team/ActivityDotMatrix';
import CmStat from '@/components/admin/team/CmStat';
import CustomerLoadPill from '@/components/admin/team/CustomerLoadPill';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { teamCopy } from '@/lib/admin/copy/team';
import { formatSek } from '@/lib/admin/money';
import type { TeamMemberView } from '@/hooks/admin/useTeam';

export default function TeamMemberKpiCluster({
  member,
}: {
  member: TeamMemberView;
}) {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <div className="flex items-center gap-6 lg:ml-auto">
      <CmStat label={teamCopy.customers} value={member.customerCount} />
      <TooltipProvider delayDuration={150}>
        <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setTooltipOpen((current) => !current)}
              className="cursor-help text-right"
            >
              <div className="text-sm font-semibold text-foreground">
                {formatSek(member.mrr_ore)}
              </div>
              <div className="text-[11px] text-muted-foreground">{teamCopy.mrr}</div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="w-56">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{teamCopy.totalMrr}</span>
                <span className="font-semibold text-foreground">
                  {formatSek(member.mrr_ore)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {teamCopy.compensationPreview(Math.round(member.commission_rate * 100))}
                </span>
                <span className="font-semibold text-foreground">
                  {formatSek(Math.round(member.mrr_ore * member.commission_rate))}
                </span>
              </div>
              <div className="border-t border-border pt-1.5 text-[11px] text-muted-foreground">
                {teamCopy.basedOnMrr}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="flex min-w-[210px] flex-col items-end gap-2">
        <CustomerLoadPill
          level={member.customerLoadLevel}
          label={member.customerLoadLabel}
          count={member.customerCount}
        />
        <ActivityDotMatrix dots={member.activityDots} />
        <div className="text-[11px] text-muted-foreground">
          {teamCopy.activitySummary(
            member.activitySummary.activeDays,
            member.activitySummary.total,
            member.activitySummary.median,
            member.activitySummary.longestRest,
          )}
        </div>
      </div>
    </div>
  );
}
