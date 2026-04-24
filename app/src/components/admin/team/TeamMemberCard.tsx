'use client';

import TeamMemberAbsenceBanner from '@/components/admin/team/TeamMemberAbsenceBanner';
import TeamMemberCardHeader from '@/components/admin/team/TeamMemberCardHeader';
import TeamMemberCustomerTable from '@/components/admin/team/TeamMemberCustomerTable';
import TeamMemberHistoryList from '@/components/admin/team/TeamMemberHistoryList';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { TeamMemberView } from '@/hooks/admin/useTeam';

export default function TeamMemberCard({
  member,
  focused,
  onSetAbsence,
  onEdit,
  onClearAbsence,
}: {
  member: TeamMemberView;
  focused: boolean;
  onSetAbsence: (member: TeamMemberView) => void;
  onEdit: (member: TeamMemberView) => void;
  onClearAbsence: (absenceId: string) => void;
}) {
  const hasCustomers = member.customers.length > 0;

  return (
    <div
      data-team-member-id={member.id}
      className={`rounded-lg border bg-card p-5 ${
        focused ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border'
      }`}
    >
      <TeamMemberCardHeader member={member} onSetAbsence={onSetAbsence} onEdit={onEdit} />

      {member.active_absence ? (
        <TeamMemberAbsenceBanner
          absence={member.active_absence}
          onClearAbsence={onClearAbsence}
        />
      ) : null}

      {hasCustomers ? (
        <>
          <TeamMemberCustomerTable customers={member.customers} />
          <TeamMemberHistoryList assignmentHistory={member.assignmentHistory} />
        </>
      ) : (
        <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 text-center bg-secondary/10">
          <p className="mb-3 text-xs text-muted-foreground">Inga kunder tilldelade än.</p>
          <Button 
            size="sm" 
            variant="outline" 
            className="h-8 text-[11px]"
            onClick={() => onEdit(member)}
          >
            <Plus className="mr-2 h-3 w-3" />
            Tilldela kunder
          </Button>
        </div>
      )}
    </div>
  );
}
