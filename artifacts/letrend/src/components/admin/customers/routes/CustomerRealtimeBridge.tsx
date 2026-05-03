'use client';

import { useCustomerRealtimeRefresh } from '@/hooks/admin/useCustomerRealtimeRefresh';

export default function CustomerRealtimeBridge({ customerId }: { customerId: string }) {
  useCustomerRealtimeRefresh(customerId);
  return null;
}
