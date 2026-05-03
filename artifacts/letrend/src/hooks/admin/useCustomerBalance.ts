'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';

export interface CustomerBalance {
  balance_ore: number;
  currency: string;
  stripe_customer_id?: string | null;
  stripe_unavailable?: boolean;
  deleted?: boolean;
}

export function useCustomerBalance(id: string) {
  return useQuery({
    queryKey: ['admin', 'customers', id, 'balance'],
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<CustomerBalance> => {
      const payload = await apiClient.get(`/api/admin/customers/${id}/balance`, {
        signal,
      });
      return payload as CustomerBalance;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
