import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const CUSTOMER_LIST_SELECT =
  'id, business_name, contact_email, customer_contact_name, phone, account_manager, account_manager_profile_id, monthly_price, subscription_interval, pricing_status, status, created_at, agreed_at, concepts_per_week, expected_concepts_per_week, paused_until, onboarding_state, onboarding_state_changed_at, tiktok_handle, next_invoice_date, stripe_customer_id, stripe_subscription_id';

export const GET = withAuth(async (_request, user) => {
  requireScope(user, 'operations_admin');

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('customer_profiles')
      .select(CUSTOMER_LIST_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      return jsonError(error.message || 'Kunde inte hamta kunder', 500);
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
