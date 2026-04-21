'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import {
  customerSubscriptionPayloadSchema,
  type CustomerSubscription,
} from '@/lib/admin/dtos/billing';
import { parseDto } from '@/lib/admin/dtos/parse';
import { qk } from '@/lib/admin/queryKeys';

export function useCustomerSubscription(id: string, stripeSubscriptionId: string | null) {
  return useQuery({
    queryKey: qk.customers.subscription(id, stripeSubscriptionId),
    enabled: Boolean(id && stripeSubscriptionId),
    queryFn: async ({ signal }): Promise<CustomerSubscription | null> => {
      const payload = await apiClient.get(`/api/admin/customers/${id}/subscription`, {
        signal,
      });
      return (await parseDto(customerSubscriptionPayloadSchema, payload)).subscription;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export type { CustomerSubscription } from '@/lib/admin/dtos/billing';
