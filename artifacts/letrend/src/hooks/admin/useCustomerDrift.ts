// @ts-nocheck
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';

export function useCustomerDrift(id: string) {
  return useQuery({
    queryKey: ['admin', 'customers', id, 'drift'],
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      return apiClient.get(`/api/admin/customers/${id}/drift`, { signal });
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
