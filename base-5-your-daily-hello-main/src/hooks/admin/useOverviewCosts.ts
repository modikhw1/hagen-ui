'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { parseDto } from '@/lib/admin/dtos/parse';
import {
  overviewCostsResponseSchema,
  type OverviewCostsDTO,
} from '@/lib/admin/dtos/overview';
import { qk } from '@/lib/admin/queryKeys';

export function useOverviewCosts() {
  return useQuery({
    queryKey: qk.overview.costs(),
    queryFn: async ({ signal }): Promise<OverviewCostsDTO> => {
      const payload = await apiClient.get('/api/admin/overview/costs', { signal });
      return parseDto(overviewCostsResponseSchema, payload, {
        name: 'overviewCostsPayload',
        path: '/api/admin/overview/costs',
      });
    },
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });
}
