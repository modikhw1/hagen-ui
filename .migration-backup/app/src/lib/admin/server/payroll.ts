import 'server-only';

import { getPayrollSnapshot } from '@/lib/admin/payroll';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export async function fetchPayrollServer(period: string | null) {
  const snapshot = await getPayrollSnapshot(createSupabaseAdmin(), {
    period,
    includeCustomerBreakdown: false,
  });

  return snapshot;
}
