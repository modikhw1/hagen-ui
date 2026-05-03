import { teamCopy } from '@/lib/admin/copy/team';
import type { TeamMemberView } from '@/hooks/admin/useTeam';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { cn } from '@/lib/utils';

export default function TeamMemberHistoryList({
  assignmentHistory,
}: {
  assignmentHistory: TeamMemberView['assignmentHistory'];
}) {
  if (assignmentHistory.length === 0) {
    return null;
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    return dateStr.split('T')[0];
  };

  const cleanNote = (note: string | null) => {
    if (!note) return null;
    const technicalPatterns = [
      'Backfilled from',
      'System generated',
      'Migrated from',
      'Auto-assigned',
    ];
    if (technicalPatterns.some(p => note.includes(p))) return null;
    return note;
  };

  // Process and filter history
  const processedHistory = assignmentHistory
    .map((assignment) => {
      const note = cleanNote(assignment.handover_note);
      const isAktiv = !assignment.valid_to;
      const isHandover = !!assignment.scheduled_effective_date;
      
      let label = 'TIDIGARE UPPDRAG';
      let tone: 'success' | 'neutral' | 'info' | 'warning' = 'neutral';
      let description = '';

      if (isHandover) {
        label = 'HANDOVER';
        tone = 'info';
        description = assignment.next_cm_name ? `Lämnas till ${assignment.next_cm_name}` : 'Byte schemalagt';
      } else if (isAktiv) {
        label = 'NUVARANDE UPPDRAG';
        tone = 'success';
        if (assignment.previous_cm_name) {
          description = `Övertagen från ${assignment.previous_cm_name}`;
        }
      } else if (assignment.next_cm_name) {
        label = 'ÖVERLÄMNAD';
        tone = 'neutral';
        description = `Lämnad till ${assignment.next_cm_name}`;
      } else if (assignment.previous_cm_name) {
        label = 'AVSLUTAT UPPDRAG';
        tone = 'neutral';
        description = `Övertagen från ${assignment.previous_cm_name}`;
      }

      return {
        ...assignment,
        cleanNote: note,
        label,
        tone,
        isAktiv,
        isHandover,
        description
      };
    })
    .slice(0, 8);

  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">
        {teamCopy.history}
      </div>
      
      <div className="space-y-2.5">
        {processedHistory.map((assignment) => (
          <div
            key={assignment.id}
            className={cn(
              "group relative rounded-lg border px-3 py-2.5 text-xs transition-all",
              assignment.isAktiv 
                ? "border-status-success-bg/40 bg-status-success-bg/5 shadow-sm" 
                : "border-border/60 bg-secondary/10"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <StatusPill 
                    label={assignment.label} 
                    tone={assignment.tone} 
                    size="xs" 
                    className="font-bold tracking-tight whitespace-nowrap" 
                  />
                  <span className={cn(
                    "font-semibold",
                    assignment.isAktiv ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {assignment.customer_name}
                  </span>
                </div>
                
                {assignment.description && (
                  <div className="text-[11px] font-medium text-amber-700/80">
                    {assignment.description}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/80">
                  <span className="font-medium">
                    {assignment.isAktiv ? 'Från' : ''} {formatDate(assignment.valid_from)}
                    {assignment.valid_to && ` — ${formatDate(assignment.valid_to)}`}
                    {!assignment.valid_to && !assignment.isAktiv && ` — ${teamCopy.historyCurrent}`}
                  </span>
                  
                  {assignment.isHandover && (
                    <span className="inline-flex items-center rounded bg-status-info-bg/10 px-1.5 py-0.5 text-[10px] font-medium text-status-info-fg">
                      {teamCopy.scheduledChange(formatDate(assignment.scheduled_effective_date)!)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {assignment.cleanNote && (
              <div className="mt-2 border-t border-border/40 pt-2 text-[11px] leading-relaxed text-muted-foreground/90">
                <span className="mr-1 text-muted-foreground/50 italic">&ldquo;</span>
                {assignment.cleanNote}
                <span className="ml-1 text-muted-foreground/50 italic">&rdquo;</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
