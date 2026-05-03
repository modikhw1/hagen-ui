import TeamPageClient from '@/app/admin/team/TeamPageClient';
import { useSearchParams } from '@/lib/navigation-compat';

export default function TeamPage() {
  const [searchParams] = useSearchParams();
  const sortParam = searchParams?.get('sort');
  const focusParam = searchParams?.get('focus');
  const sortMode: 'standard' | 'anomalous' = sortParam === 'anomalous' ? 'anomalous' : 'standard';
  const focusedMemberId = focusParam ?? null;

  return (
    <TeamPageClient
      initialTeam={[]}
      initialSortMode={sortMode}
      initialFocusedMemberId={focusedMemberId}
    />
  );
}
