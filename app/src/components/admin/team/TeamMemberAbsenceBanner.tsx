import { cmAbsenceCopy, teamCopy } from '@/lib/admin/copy/team';
import type { TeamMemberView } from '@/hooks/admin/useTeam';

export default function TeamMemberAbsenceBanner({
  absence,
  onClearAbsence,
}: {
  absence: NonNullable<TeamMemberView['active_absence']>;
  onClearAbsence: (absenceId: string) => void;
}) {
  const absenceTypeLabel =
    cmAbsenceCopy.typeLabels[
      absence.absence_type as keyof typeof cmAbsenceCopy.typeLabels
    ] ?? absence.absence_type;

  return (
    <div className="mb-4 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-foreground">
          {teamCopy.activeAbsenceRange(absence.starts_on, absence.ends_on)}
        </span>
        <span>
          {teamCopy.typeLabel}: {absenceTypeLabel}
        </span>
        <span>
          {teamCopy.payrollLabel}:{' '}
          {absence.compensation_mode === 'primary_cm'
            ? teamCopy.payrollPrimary
            : teamCopy.payrollBackup}
        </span>
        {absence.backup_cm_id ? <span>{teamCopy.replacementAssigned}</span> : null}
        <button
          type="button"
          onClick={() => onClearAbsence(absence.id)}
          className="ml-auto text-xs font-semibold text-foreground hover:opacity-70"
        >
          {teamCopy.endAbsence}
        </button>
      </div>
    </div>
  );
}
