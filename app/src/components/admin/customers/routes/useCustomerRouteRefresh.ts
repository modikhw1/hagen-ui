'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

export function useCustomerRouteRefresh(customerId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', customerId] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', customerId, 'invoices'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', customerId, 'tiktok'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', customerId, 'activity'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', customerId, 'pending-items'] }),
      queryClient.invalidateQueries({
        queryKey: ['admin', 'customer', customerId, 'subscription'],
      }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'billing', 'subscriptions'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'billing', 'invoices'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
    ]);

    router.refresh();
  };
}
