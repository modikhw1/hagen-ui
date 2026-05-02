import { NextRequest } from 'next/server';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { getPayrollSnapshot } from '@/lib/admin/payroll';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(async (request: NextRequest, user) => {
  requireScope(user, 'payroll.read');

  try {
    const url = new URL(request.url);
    const period = url.searchParams.get('period');
    const includeBreakdown = url.searchParams.get('includeBreakdown') !== '0';
    const minimal = url.searchParams.get('minimal') === '1'; // New flag for speed

    const supabaseAdmin = createSupabaseAdmin();
    const snapshot = await getPayrollSnapshot(supabaseAdmin, {
      period,
      includeCustomerBreakdown: includeBreakdown,
      includePreviousPeriod: !minimal, // Only fetch previous period if not minimal
    });
    
    const response = jsonOk(snapshot);
    response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    return response;
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte hämta payroll-underlaget',
      500,
    );
  }
}, ['admin']);
