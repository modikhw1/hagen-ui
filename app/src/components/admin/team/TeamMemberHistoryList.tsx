import { teamCopy } from '@/lib/admin/copy/team';
import type { TeamMemberView } from '@/hooks/admin/useTeam';

export default function TeamMemberHistoryList({
  assignmentHistory,
}: {
  assignmentHistory: TeamMemberView['assignmentHistory'];
}) {
  if (assignmentHistory.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {teamCopy.history}
      </div>
      <div className="space-y-2">
        {assignmentHistory.slice(0, 6).map((assignment) => (
          <div
            key={assignment.id}
            className="rounded-md border border-border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground"
          >
            <div className="font-semibold text-foreground">{assignment.customer_name}</div>
            <div>
              {assignment.valid_from} - {assignment.valid_to || teamCopy.historyCurrent}
              {assignment.scheduled_effective_date
                ? ` · ${teamCopy.scheduledChange(assignment.scheduled_effective_date)}`
                : ''}
            </div>
            {assignment.handover_note ? <div className="mt-1">{assignment.handover_note}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
