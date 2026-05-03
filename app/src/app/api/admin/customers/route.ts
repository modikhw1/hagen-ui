import { NextRequest } from 'next/server';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const CUSTOMER_LIST_SELECT =
  'id, business_name, contact_email, customer_contact_name, phone, account_manager, account_manager_profile_id, monthly_price, subscription_interval, pricing_status, status, created_at, agreed_at, concepts_per_week, expected_concepts_per_week, paused_until, onboarding_state, onboarding_state_changed_at, tiktok_handle, next_invoice_date, stripe_customer_id, stripe_subscription_id';

function escapeLike(value: string) {
  return value.replaceAll('%', '\\%').replaceAll(',', ' ');
}

export const GET = withAuth(async (request: NextRequest, user) => {
  requireScope(user, 'customers.read');

  try {
    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? 50);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 200);
    const supabaseAdmin = createSupabaseAdmin();
    let query = supabaseAdmin
      .from('customer_profiles')
      .select(CUSTOMER_LIST_SELECT)
      .order('created_at', { ascending: false });

    if (q.length >= 2) {
      const term = escapeLike(q);
      query = query
        .or(
          [
            `business_name.ilike.%${term}%`,
            `contact_email.ilike.%${term}%`,
            `customer_contact_name.ilike.%${term}%`,
            `phone.ilike.%${term}%`,
            `tiktok_handle.ilike.%${term}%`,
          ].join(','),
        )
        .limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError(error.message || 'Kunde inte hämta kunder', 500);
    }

    return new Response(JSON.stringify({ customers: data ?? [] }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=10',
      },
    });
  } catch {
    return jsonError('Internt serverfel', 500);
  }
}, ['admin']);
