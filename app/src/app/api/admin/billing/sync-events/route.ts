import { NextRequest } from 'next/server';
import { withAuth, requireScope } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

/**
 * GET /api/admin/billing/sync-events
 *
 * Globala (system-breda) Stripe-sync-events. Används av billing-cockpit
 * för att visa det senaste webhook-flödet på en kompakt widget.
 */
export const GET = withAuth(
  async (request: NextRequest, user) => {
    requireScope(user, 'billing.invoices.read');

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '10'), 100);
    const status = url.searchParams.get('status');

    const supabaseAdmin = createSupabaseAdmin();
    let query = supabaseAdmin
      .from('stripe_sync_events' as never)
      .select(
        'id, stripe_event_id, event_type, object_type, object_id, customer_profile_id, source, status, applied_changes, error_message, received_at, processed_at, environment',
      )
      .order('received_at', { ascending: false })
      .limit(limit);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return jsonError(error.message, 500);

    return new Response(JSON.stringify({ events: data ?? [] }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=10',
      },
    });
  },
  ['admin'],
);