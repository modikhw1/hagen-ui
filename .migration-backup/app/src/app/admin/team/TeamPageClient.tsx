// app/src/app/admin/team/TeamPageClient.tsx
'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import EmptyState from '@/components/admin/EmptyState';
import { AddCMDialog } from '@/components/admin/team/AddCMDialog';
import CMAbsenceModal from '@/components/admin/team/CMAbsenceModal';
import TeamMemberCard from '@/components/admin/team/TeamMemberCard';
import TeamMemberCardSkeleton from '@/components/admin/team/TeamMemberCardSkeleton';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import { Button } from '@mantine/core';
import { useEndAbsence } from '@/hooks/admin/useEndAbsence';
import { useFocusedTeamMember } from '@/hooks/admin/useFocusedTeamMember';
import { useTeam, type TeamMemberView } from '@/hooks/admin/useTeam';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
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

  const [absenceTarget, setAbsenceTarget] = useState<TeamMemberView | null>(null);

  const focusedMemberId = searchParams?.get('focus') ?? initialFocusedMemberId;
  const sortMode =
    (searchParams?.get('sort') ?? initialSortMode) === 'anomalous' ? 'anomalous' : 'standard';

  const { data: team = initialTeam, isLoading } = useTeam(sortMode, {
    initialData: initialTeam,
  });

  const endAbsence = useEndAbsence();
  useFocusedTeamMember(focusedMemberId, false);

  const toggleSort = useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('sort', sortMode === 'standard' ? 'anomalous' : 'standard');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams, sortMode]);

  const refresh = useAdminRefresh();

  const handleAbsenceSaved = useCallback(async () => {
    setAbsenceTarget(null);
    await refresh(['team', 'customers']);
  }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={teamCopy.title}
        subtitle={teamCopy.subtitle}
        actions={
          <>
            <Button
              component={Link}
              href="/admin/payroll"
              variant="outline"
              size="sm"
            >
              {teamCopy.payroll}
            </Button>
            <Button variant="outline" size="sm" onClick={toggleSort}>
              {sortMode === 'anomalous' ? teamCopy.sortStandard : teamCopy.sortAnomalous}
            </Button>
            <AddCMDialog />
          </>
        }
      />

      {isLoading && team.length === 0 ? (
        <div className="space-y-4">
          <TeamMemberCardSkeleton />
          <TeamMemberCardSkeleton />
          <TeamMemberCardSkeleton />
        </div>
      ) : team.length === 0 ? (
        <div className="space-y-4">
          <EmptyState icon={Users} title={teamCopy.emptyTitle} hint={teamCopy.emptyHint} />
          <AddCMDialog />
        </div>
      ) : (
        <div className="space-y-4">
          {team.map((member) => (
            <TeamMemberCard
              key={member.id}
              member={member}
              focused={focusedMemberId === member.id}
              onSetAbsence={setAbsenceTarget}
              onClearAbsence={(absenceId) => void endAbsence.mutateAsync(absenceId)}
            />
          ))}
        </div>
      )}

      {absenceTarget ? (
        <CMAbsenceModal
          open={Boolean(absenceTarget)}
          cm={absenceTarget}
          team={team}
          onClose={() => setAbsenceTarget(null)}
          onSaved={handleAbsenceSaved}
        />
      ) : null}
    </div>
  );
}
