'use client';

import Link from 'next/link';
import { Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import EmptyState from '@/components/admin/EmptyState';
import AddCMDialog from '@/components/admin/team/AddCMDialog';
import CMAbsenceModal from '@/components/admin/team/CMAbsenceModal';
import CMEditDialog from '@/components/admin/team/CMEditDialog';
import TeamMemberCard from '@/components/admin/team/TeamMemberCard';
import TeamMemberCardSkeleton from '@/components/admin/team/TeamMemberCardSkeleton';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import { Button, buttonVariants } from '@/components/ui/button';
import { useEndAbsence } from '@/hooks/admin/useEndAbsence';
import { useFocusedTeamMember } from '@/hooks/admin/useFocusedTeamMember';
import { useTeam, type TeamMemberView } from '@/hooks/admin/useTeam';
import { teamCopy } from '@/lib/admin/copy/team';

export default function TeamPageClient({
  initialTeam,
  initialSortMode = 'standard',
  initialFocusedMemberId = null,
}: {
  initialTeam: TeamMemberView[];
  initialSortMode?: string;
  initialFocusedMemberId?: string | null;
}) {
  const pathname = usePathname() ?? '/admin/team';
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<TeamMemberView | null>(null);
  const [absenceTarget, setAbsenceTarget] = useState<TeamMemberView | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const focusedMemberId = searchParams?.get('focus') ?? initialFocusedMemberId;
  const sortMode = (searchParams?.get('sort') ?? initialSortMode) === 'anomalous' ? 'anomalous' : 'standard';

  const { data: team = initialTeam, isLoading, refetch } = useTeam(sortMode, {
    initialData: initialTeam,
  });
  
  const endAbsence = useEndAbsence();
  useFocusedTeamMember(focusedMemberId, isLoading);

  const activeCmOptions = useMemo(
    () =>
      team
        .filter((member) => member.is_active)
        .map((member) => ({
          id: member.id,
          name: member.name,
          is_active: member.is_active,
        })),
    [team],
  );

  const toggleSort = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('sort', sortMode === 'standard' ? 'anomalous' : 'standard');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={teamCopy.title}
        subtitle={teamCopy.subtitle}
        actions={
          <>
            <Link
              href="/admin/payroll"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {teamCopy.payroll}
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSort}
            >
              {sortMode === 'anomalous' ? teamCopy.sortStandard : teamCopy.sortAnomalous}
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              {teamCopy.addCm}
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <TeamMemberCardSkeleton />
          <TeamMemberCardSkeleton />
          <TeamMemberCardSkeleton />
        </div>
      ) : team.length === 0 ? (
        <div className="space-y-4">
          <EmptyState icon={Users} title={teamCopy.emptyTitle} hint={teamCopy.emptyHint} />
          <Button size="sm" onClick={() => setShowAdd(true)} className="w-fit">
            <Plus className="h-4 w-4" />
            {teamCopy.addCm}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {team.map((member) => (
            <TeamMemberCard
              key={member.id}
              member={member}
              focused={focusedMemberId === member.id}
              onSetAbsence={setAbsenceTarget}
              onEdit={setSelected}
              onClearAbsence={(absenceId) => void endAbsence.mutateAsync(absenceId)}
            />
          ))}
        </div>
      )}

      <AddCMDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={async () => {
          setShowAdd(false);
          await refetch();
        }}
      />

      {selected ? (
        <CMEditDialog
          open={Boolean(selected)}
          cm={selected}
          allCMs={activeCmOptions}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            setSelected(null);
            await refetch();
          }}
        />
      ) : null}

      {absenceTarget ? (
        <CMAbsenceModal
          open={Boolean(absenceTarget)}
          cm={absenceTarget}
          team={team}
          onClose={() => setAbsenceTarget(null)}
          onSaved={() => {
            setAbsenceTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
