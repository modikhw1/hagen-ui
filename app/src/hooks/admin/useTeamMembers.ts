'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { parseDto } from '@/lib/admin/dtos/parse';
import {
  teamMembersPayloadSchema,
  type TeamMemberRow,
} from '@/lib/admin/dtos/team';
import { qk } from '@/lib/admin/queryKeys';

export function useTeamMembers() {
  return useQuery({
    queryKey: qk.team.list(),
    queryFn: async ({ signal }): Promise<TeamMemberRow[]> => {
      const payload = await apiClient.get('/api/admin/team', { signal });
      return (await parseDto(teamMembersPayloadSchema, payload)).members;
    },
  });
}

export type { TeamMemberRow } from '@/lib/admin/dtos/team';
