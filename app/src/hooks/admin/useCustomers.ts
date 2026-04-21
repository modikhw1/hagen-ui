'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import {
  customerListPayloadSchema,
  type CustomerListPayload,
} from '@/lib/admin/dtos/customer';
import { parseDto } from '@/lib/admin/dtos/parse';
import { qk } from '@/lib/admin/queryKeys';

type UseCustomersOptions<TSelected> = {
  select?: (data: CustomerListPayload) => TSelected;
};

export function useCustomers<TSelected = CustomerListPayload>(
  options?: UseCustomersOptions<TSelected>,
): UseQueryResult<TSelected> {
  return useQuery({
    queryKey: qk.customers.list(),
    queryFn: async ({ signal }) => {
      const payload = await apiClient.get('/api/admin/customers', { signal });
      return parseDto(customerListPayloadSchema, payload);
    },
    select: options?.select,
  });
}

export function useActiveCustomers() {
  return useCustomers({
    select: (data) =>
      data.customers.filter((customer) => customer.status === 'active'),
  });
}

export type {
  CustomerBufferRow,
  CustomerListPayload,
  CustomerListRow,
} from '@/lib/admin/dtos/customer';
