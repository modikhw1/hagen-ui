'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import {
  customerInvoicesPayloadSchema,
  type CustomerInvoice,
} from '@/lib/admin/dtos/billing';
import { parseDto } from '@/lib/admin/dtos/parse';
import { qk } from '@/lib/admin/queryKeys';

export function useCustomerInvoices(id: string) {
  return useQuery({
    queryKey: qk.customers.invoices(id),
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<CustomerInvoice[]> => {
      const payload = await apiClient.get(`/api/admin/customers/${id}/invoices`, { signal });
      return (await parseDto(customerInvoicesPayloadSchema, payload)).invoices;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export type { CustomerInvoice } from '@/lib/admin/dtos/billing';
