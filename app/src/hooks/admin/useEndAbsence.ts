'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addAdminBreadcrumb, captureAdminError } from '@/lib/admin/admin-telemetry';
import { apiClient } from '@/lib/admin/api-client';
import { invalidateAdminScopes } from '@/lib/admin/invalidate';

export function useEndAbsence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['admin', 'team', 'absence-end'],
    mutationFn: async (absenceId: string) => {
      addAdminBreadcrumb('admin.team.absence_end', {
        phase: 'start',
        absence_id: absenceId,
      });

      await apiClient.del(`/api/admin/team/absences/${absenceId}`);

      addAdminBreadcrumb('admin.team.absence_end', {
        phase: 'success',
        absence_id: absenceId,
      });
    },
    onSuccess: async () => invalidateAdminScopes(queryClient, ['team']),
    onError: (error, absenceId) => {
      captureAdminError('admin.team.absence_end', error, { absence_id: absenceId });
    },
  });
}
