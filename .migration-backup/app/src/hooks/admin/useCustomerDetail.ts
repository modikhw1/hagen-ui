'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import {
  customerDetailPayloadSchema,
  type CustomerDetail,
} from '@/lib/admin/dtos/customer';
import { parseDto } from '@/lib/admin/dtos/parse';
import { qk } from '@/lib/admin/queryKeys';

export function useCustomerDetail(id: string) {
  return useQuery<CustomerDetail, Error, CustomerDetail>({
    queryKey: qk.customers.detail(id),
    enabled: Boolean(id) && id !== 'new',
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    queryFn: async ({ signal }): Promise<CustomerDetail> => {
      const payload = await apiClient.get(`/api/admin/customers/${id}`, { signal });
      return (await parseDto(customerDetailPayloadSchema, payload, {
        name: 'customerDetail',
        path: `/api/admin/customers/${id}`,
      })).customer;
    },
  });
}

export type { CustomerDetail } from '@/lib/admin/dtos/customer';
