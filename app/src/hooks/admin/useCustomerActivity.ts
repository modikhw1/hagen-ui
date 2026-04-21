'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import {
  customerActivityPayloadSchema,
  type CustomerActivityPayload,
} from '@/lib/admin/dtos/customer';
import { parseDto } from '@/lib/admin/dtos/parse';
import { qk } from '@/lib/admin/queryKeys';

export function useCustomerActivity(id: string) {
  return useQuery({
    queryKey: qk.customers.activity(id),
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<CustomerActivityPayload> => {
      const payload = await apiClient.get(`/api/admin/customers/${id}/activity-log`, {
        signal,
      });
      return parseDto(customerActivityPayloadSchema, payload);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export type { CustomerActivityEntry, CustomerActivityPayload } from '@/lib/admin/dtos/customer';
