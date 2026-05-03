'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import TeamMemberAbsenceBanner from '@/components/admin/team/TeamMemberAbsenceBanner';
import TeamMemberCardHeader from '@/components/admin/team/TeamMemberCardHeader';
import TeamMemberCustomerTable from '@/components/admin/team/TeamMemberCustomerTable';
import TeamMemberHistoryList from '@/components/admin/team/TeamMemberHistoryList';
import type { TeamMemberView } from '@/hooks/admin/useTeam';

export default function TeamMemberCard({
  member,
  focused,
  onSetAbsence,
  onClearAbsence,
}: {
  member: TeamMemberView;
  focused: boolean;
  onSetAbsence: (member: TeamMemberView) => void;
  onClearAbsence: (absenceId: string) => void;
}) {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const hasCustomers = member.customers.length > 0;
  const hasHistory = member.assignmentHistory.length > 0;
  const historySummary = `${member.assignmentHistory.length} handovers`;

  return (
    <div
      data-team-member-id={member.id}
      className={`rounded-lg border bg-card p-5 ${
        focused ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border'
      }`}
    >
      <TeamMemberCardHeader member={member} onSetAbsence={onSetAbsence} />

      {member.active_absence ? (
        <TeamMemberAbsenceBanner
          absence={member.active_absence}
          onClearAbsence={onClearAbsence}
        />
      ) : null}

      {hasCustomers ? (
        <TeamMemberCustomerTable customers={member.customers} />
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-secondary/10 py-8 text-center">
          <p className="text-xs text-muted-foreground">Inga kunder tilldelade än.</p>
        </div>
      )}

      {hasHistory ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setHistoryExpanded((current) => !current)}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2 text-left transition-colors hover:bg-secondary/35"
          >
            <div>
              <div className="text-sm font-semibold text-foreground">
                {historyExpanded ? 'Dölj historik' : 'Visa historik och handovers'}
              </div>
              <div className="text-xs text-muted-foreground">{historySummary}</div>
            </div>
            {historyExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {historyExpanded ? (
            <TeamMemberHistoryList assignmentHistory={member.assignmentHistory} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
