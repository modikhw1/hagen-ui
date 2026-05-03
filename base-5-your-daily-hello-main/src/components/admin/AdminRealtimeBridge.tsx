'use client';

import { useAdminRealtimeInvalidation } from '@/hooks/admin/useAdminRealtimeInvalidation';

export default function AdminRealtimeBridge() {
  useAdminRealtimeInvalidation();
  return null;
}
