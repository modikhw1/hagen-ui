'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { qk } from '@/lib/admin/queryKeys';

export type PendingInvoiceItem = {
  id: string;
  description: string;
  amount_ore: number;
  amount_sek: number;
  currency: string;
  created: string | null;
  metadata?: Record<string, string>;
};

export function useCustomerPendingInvoiceItems(customerId: string) {
  return useQuery({
    queryKey: qk.customers.pendingItems(customerId),
    queryFn: async (): Promise<PendingInvoiceItem[]> => {
      const payload = await apiClient.get<{ items?: PendingInvoiceItem[] }>(
        `/api/admin/customers/${customerId}/invoice-items`,
      );
      return payload.items ?? [];
    },
  });
}
