'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { qk } from '@/lib/admin/queryKeys';

export function useCreateTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      apiClient.post('/api/admin/team/create', payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.team.list() }),
        queryClient.invalidateQueries({ queryKey: qk.team.overview() }),
        queryClient.invalidateQueries({ queryKey: qk.payroll.period(null) }),
      ]);
    },
  });
}
