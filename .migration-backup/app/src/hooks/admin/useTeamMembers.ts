'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { parseDto } from '@/lib/admin/dtos/parse';
import { teamMembersLitePayloadSchema, type TeamMemberLite } from '@/lib/admin/dtos/team';
import { qk } from '@/lib/admin/queryKeys';

type TeamMembersQuery = {
  role?: 'admin' | 'content_manager';
  includeInactive?: boolean;
};

export function useTeamMembers(query: TeamMembersQuery = {}) {
  return useQuery({
    queryKey: qk.team.lite(query),
    queryFn: async ({ signal }): Promise<TeamMemberLite[]> => {
      const payload = await apiClient.get('/api/admin/team/lite', {
        signal,
        query: {
          ...(query.role ? { role: query.role } : {}),
          ...(query.includeInactive ? { includeInactive: 1 } : {}),
        },
      });
      return (await parseDto(teamMembersLitePayloadSchema, payload, {
        name: 'teamMembersLitePayload',
        path: '/api/admin/team/lite',
      })).members;
    },
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
  });
}

export type TeamMemberRow = TeamMemberLite;
