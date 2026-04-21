import { qk } from '@/lib/admin/queryKeys';

export const customerKeys = {
  detail: (customerId: string) => ['admin', 'customer', customerId] as const,
  invoices: (customerId: string) => ['admin', 'customer', customerId, 'invoices'] as const,
  tiktok: (customerId: string) => ['admin', 'customer', customerId, 'tiktok'] as const,
  activity: (customerId: string) => ['admin', 'customer', customerId, 'activity'] as const,
  pendingItems: (customerId: string) => ['admin', 'customer', customerId, 'pending-items'] as const,
  subscription: (customerId: string) => ['admin', 'customer', customerId, 'subscription'] as const,
};

export { qk };
