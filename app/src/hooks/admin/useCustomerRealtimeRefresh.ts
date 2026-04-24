'use client';

import { useEffect, useRef } from 'react';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { supabase } from '@/lib/supabase/client';

const REFRESH_DEBOUNCE_MS = 250;
const realtimeOwners = new Set<string>();

/**
 * Customer realtime is owned by the shell/layout bridge.
 * Route components should not mount their own realtime listeners.
 */
export function useCustomerRealtimeRefresh(customerId: string) {
  const refresh = useAdminRefresh();
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!customerId) {
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      if (realtimeOwners.has(customerId)) {
        console.warn(
          `[admin] useCustomerRealtimeRefresh mounted more than once for customer ${customerId}. Mount it only in the shell bridge.`,
        );
      }
      realtimeOwners.add(customerId);
    }

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        void refresh([{ type: 'customer-billing', customerId }]);
      }, REFRESH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`admin-customer-${customerId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invoices',
        filter: `customer_profile_id=eq.${customerId}`,
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'subscriptions',
        filter: `customer_profile_id=eq.${customerId}`,
      }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      if (process.env.NODE_ENV !== 'production') {
        realtimeOwners.delete(customerId);
      }

      void supabase.removeChannel(channel);
    };
  }, [customerId, refresh]);
}
