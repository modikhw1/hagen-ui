import TeamPageClient from '@/app/admin/team/TeamPageClient';
import { loadAdminTeamOverview } from '@/lib/admin/server/team';

export default async function TeamPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const sortParam = resolvedSearchParams.sort;
  const focusParam = resolvedSearchParams.focus;
  const sortMode =
    (Array.isArray(sortParam) ? sortParam[0] : sortParam) === 'anomalous'
      ? 'anomalous'
      : 'standard';
  const focusedMemberId =
    typeof focusParam === 'string'
      ? focusParam
      : Array.isArray(focusParam)
        ? focusParam[0] ?? null
        : null;
  const initialData = await loadAdminTeamOverview(sortMode);

  return (
    <TeamPageClient
      initialTeam={initialData.members}
      initialSortMode={sortMode}
      initialFocusedMemberId={focusedMemberId}
    />
  );
}
