'use client';

import { useEffect, useRef } from 'react';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { supabase } from '@/lib/supabase/client';

const THROTTLE_MS = 500;

export function useAdminRealtimeInvalidation() {
  const refresh = useAdminRefresh();
  const lastRunRef = useRef(new Map<string, number>());

  useEffect(() => {
    const shouldRun = (key: string) => {
      const now = Date.now();
      const last = lastRunRef.current.get(key) ?? 0;
      if (now - last < THROTTLE_MS) {
        return false;
      }

      lastRunRef.current.set(key, now);
      return true;
    };

    const run = (key: string, fn: () => unknown | Promise<unknown>) => {
      if (!shouldRun(key)) {
        return;
      }

      void fn();
    };

    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'customer_profiles',
      }, (payload) => {
        const customerId = ((payload.new ?? payload.old ?? {}) as { id?: string }).id;
        if (customerId) {
          run(`customer:${customerId}`, () => refresh([{ type: 'customer', customerId }]));
          return;
        }

        run('overview', () => refresh([{ type: 'global', scope: 'overview' }]));
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invoices',
      }, (payload) => {
        const customerId = ((payload.new ?? payload.old ?? {}) as { customer_profile_id?: string }).customer_profile_id;
        if (customerId) {
          run(`customer:${customerId}`, () => refresh([{ type: 'customer', customerId }]));
          return;
        }

        run('billing', () => refresh([{ type: 'global', scope: 'billing' }]));
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'subscriptions',
      }, (payload) => {
        const customerId = ((payload.new ?? payload.old ?? {}) as { customer_profile_id?: string }).customer_profile_id;
        if (customerId) {
          run(`customer:${customerId}`, () => refresh([{ type: 'customer', customerId }]));
          return;
        }

        run('billing', () => refresh([{ type: 'global', scope: 'billing' }]));
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cm_assignments',
      }, (payload) => {
        const customerId = ((payload.new ?? payload.old ?? {}) as { customer_profile_id?: string }).customer_profile_id;
        if (customerId) {
          run(`customer:${customerId}`, () => refresh([{ type: 'customer', customerId }]));
          return;
        }

        run('team', () => refresh([{ type: 'global', scope: 'team' }]));
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cm_coverages',
      }, () => {
        run('team', () => refresh([{ type: 'global', scope: 'team' }]));
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cm_absences',
      }, (payload) => {
        const customerId = ((payload.new ?? payload.old ?? {}) as { customer_profile_id?: string }).customer_profile_id;
        if (customerId) {
          run(`customer:${customerId}`, () => refresh([{ type: 'customer', customerId }]));
          return;
        }

        run('team', () => refresh([{ type: 'global', scope: 'team' }]));
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cm_notifications',
      }, () => {
        run('notifications', () => refresh([{ type: 'global', scope: 'notifications' }]));
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);
}