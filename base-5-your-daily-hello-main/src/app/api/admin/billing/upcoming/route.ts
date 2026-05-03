import { NextRequest } from 'next/server';
import { withAuth, requireScope } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

/**
 * GET /api/admin/billing/upcoming
 *
 * Returnerar förväntade fakturor de kommande 30 dagarna baserat på
 * customer_profiles.next_invoice_date + monthly_price.
 *
 * Query:
 *  - days (default 30, max 90)
 */
export const GET = withAuth(async (request: NextRequest, user) => {
  try {
    requireScope(user, 'billing.invoices.read');

    const daysParam = Number(request.nextUrl.searchParams.get('days') ?? 30);
    const days = Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 30, 1), 90);

    const supabaseAdmin = createSupabaseAdmin();
    const now = new Date();
    const horizon = new Date(now.getTime() + days * 86_400_000);

    const { data, error } = await supabaseAdmin
      .from('customer_profiles')
      .select(
        'id, business_name, monthly_price, next_invoice_date, paused_until, status, stripe_subscription_id',
      )
      .not('next_invoice_date', 'is', null)
      .gte('next_invoice_date', now.toISOString().slice(0, 10))
      .lte('next_invoice_date', horizon.toISOString().slice(0, 10))
      .order('next_invoice_date', { ascending: true })
      .limit(200);

    if (error) {
      return jsonError(error.message, 500);
    }

    const rows = (data ?? [])
      .filter((row) => row.status !== 'archived' && !row.paused_until)
      .map((row) => ({
        customer_id: row.id,
        business_name: row.business_name,
        amount_ore: typeof row.monthly_price === 'number' ? row.monthly_price : 0,
        invoice_date: row.next_invoice_date as string,
        has_stripe_subscription: Boolean(row.stripe_subscription_id),
      }));

    const totalOre = rows.reduce((sum, r) => sum + r.amount_ore, 0);

    return new Response(
      JSON.stringify({
        upcoming: rows,
        summary: {
          totalOre,
          count: rows.length,
          daysAhead: days,
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Server error', 500);
  }
}, ['admin']);
