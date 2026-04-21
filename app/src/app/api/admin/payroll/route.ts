import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { getPayrollSnapshot } from '@/lib/admin/payroll';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(async (request: NextRequest) => {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get('period');
    const supabaseAdmin = createSupabaseAdmin();
    const snapshot = await getPayrollSnapshot(supabaseAdmin, { period });
    return jsonOk(snapshot);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte hamta payroll-underlaget',
      500,
    );
  }
}, ['admin']);
