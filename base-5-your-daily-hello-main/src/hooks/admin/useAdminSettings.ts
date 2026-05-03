'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { invalidateFor } from '@/lib/admin/cache-invalidation';
import { parseDto } from '@/lib/admin/dtos/parse';
import {
  adminSettingsResponseSchema,
  updateAdminSettingsInputSchema,
} from '@/lib/admin/schemas/settings';
import { qk } from '@/lib/admin/queryKeys';

export function useAdminSettings() {
  return useQuery({
    queryKey: qk.settings.root(),
    queryFn: async ({ signal }) => {
      const payload = await apiClient.get('/api/admin/settings', { signal });
      return parseDto(adminSettingsResponseSchema, payload, {
        name: 'adminSettingsResponse',
        path: '/api/admin/settings',
      });
    },
    staleTime: 60_000,
  });
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Parameters<typeof updateAdminSettingsInputSchema.parse>[0]) => {
      const payload = await apiClient.patch(
        '/api/admin/settings',
        updateAdminSettingsInputSchema.parse(input),
      );
      return parseDto(adminSettingsResponseSchema, payload, {
        name: 'adminSettingsResponse',
        path: '/api/admin/settings',
      });
    },
    onSuccess: async (payload) => {
      queryClient.setQueryData(qk.settings.root(), payload);
      await invalidateFor(queryClient, 'settings.update');
    },
  });
}
