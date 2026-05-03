'use client';

import {
  keepPreviousData,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import {
  customerListPayloadSchema,
  type CustomerListPayload,
} from '@/lib/admin/dtos/customer';
import { parseDto } from '@/lib/admin/dtos/parse';
import { qk, type CustomerListFilter } from '@/lib/admin/queryKeys';

type UseCustomersOptions<TSelected> = {
  filter?: CustomerListFilter;
  select?: (data: CustomerListPayload) => TSelected;
};

export function useCustomers<TSelected = CustomerListPayload>(
  options?: UseCustomersOptions<TSelected>,
): UseQueryResult<TSelected> {
  const filter = options?.filter ?? {};

  return useQuery({
    queryKey: qk.customers.list(filter),
    queryFn: async ({ signal }) => {
      const payload = await apiClient.get('/api/admin/customers', {
        signal,
        query: {
          status: filter.status,
          cmId: filter.cmId,
          q: filter.q,
          page: filter.page,
          limit: filter.limit,
        },
      });
      return parseDto(customerListPayloadSchema, payload, {
        name: 'customerListPayload',
        path: '/api/admin/customers',
      });
    },
    select: options?.select,
    staleTime: 30_000,
    gcTime: 300_000,
    placeholderData: keepPreviousData,
  });
}

export type {
  CustomerBufferRow,
  CustomerListPayload,
  CustomerListRow,
} from '@/lib/admin/dtos/customer';
