'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { parseDto } from '@/lib/admin/dtos/parse';
import { teamOverviewSchema, type TeamMemberView } from '@/lib/admin/dtos/team';
import { qk } from '@/lib/admin/queryKeys';

export function useTeam(
  sortMode: 'standard' | 'anomalous' = 'standard',
  options?: { initialData?: TeamMemberView[] },
) {
  return useQuery({
    queryKey: qk.team.list(sortMode),
    queryFn: async ({ signal }): Promise<TeamMemberView[]> => {
      const payload = await apiClient.get('/api/admin/team', {
        signal,
        query: { sort: sortMode },
      });
      return (await parseDto(teamOverviewSchema, payload, {
        name: 'teamOverview',
        path: '/api/admin/team',
      })).members;
    },
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    initialData: options?.initialData,
  });
}

export type { TeamMemberView } from '@/lib/admin/dtos/team';
export type { TeamCustomer } from '@/lib/admin/dtos/team';
