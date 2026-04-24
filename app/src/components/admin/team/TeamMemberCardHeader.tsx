import AdminAvatar from '@/components/admin/AdminAvatar';
import TeamMemberKpiCluster from '@/components/admin/team/TeamMemberKpiCluster';
import { teamCopy } from '@/lib/admin/copy/team';
import type { TeamMemberView } from '@/hooks/admin/useTeam';
import { cmColorVar } from '@/lib/admin/teamPalette';

export default function TeamMemberCardHeader({
  member,
  onSetAbsence,
  onEdit,
}: {
  member: TeamMemberView;
  onSetAbsence: (member: TeamMemberView) => void;
  onEdit: (member: TeamMemberView) => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="shrink-0">
          <AdminAvatar 
            name={member.name} 
            avatarUrl={member.avatar_url} 
            size="lg" 
            fallbackColor={`hsl(var(--${cmColorVar(member.id)}))`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-foreground">{member.name}</div>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground tracking-tight">
              {teamCopy.deviation(Math.round(member.activityDeviation * 100))}
            </span>
            {member.active_absence ? (
              <span className="rounded-full bg-status-warning-bg px-2 py-0.5 text-[10px] font-bold uppercase text-status-warning-fg border border-status-warning-fg/20">
                {teamCopy.activeAbsenceUntil(member.active_absence.ends_on)}
              </span>
            ) : null}
            {member.isCovering ? (
              <span className="rounded-full bg-status-info-bg px-2 py-0.5 text-[10px] font-bold uppercase text-status-info-fg border border-status-info-fg/20">
                {teamCopy.cover}
              </span>
            ) : null}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {member.city || member.email || teamCopy.noLocation}
          </div>
        </div>
      </div>

      <TeamMemberKpiCluster member={member} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSetAbsence(member)}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {teamCopy.setAbsence}
        </button>
        <button
          type="button"
          onClick={() => onEdit(member)}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {teamCopy.edit}
        </button>
      </div>
    </div>
  );
}
