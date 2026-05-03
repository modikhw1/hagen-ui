import { NextRequest } from 'next/server';
import { withAuth, requireScope } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/customers/[id]/billing/sync-events
 *
 * Returnerar de senaste Stripe-syncade händelserna för en kund.
 * Cockpit-vyn och kundens billing-tab läser härifrån för att visa
 * "vad har hänt med kundens fakturor/abb senast", inkl. ändringar
 * som kommit från Stripe Dashboard.
 */
export const GET = withAuth(
  async (request: NextRequest, user, { params }: RouteParams) => {
    requireScope(user, 'customers.read');

    const { id } = await params;
    if (!id) return jsonError('Kund-ID krävs', 400);

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);

    const supabaseAdmin = createSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('stripe_sync_events' as never)
      .select(
        'id, stripe_event_id, event_type, object_type, object_id, source, status, applied_changes, error_message, received_at, processed_at, environment',
      )
      .eq('customer_profile_id', id)
      .order('received_at', { ascending: false })
      .limit(limit);

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