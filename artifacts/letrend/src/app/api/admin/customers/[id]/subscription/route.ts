import { withAuth, requireScope } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth(async (_request, user, { params }: RouteParams) => {
  requireScope(user, 'customers.read');

  const { id } = await params;
  if (!id) {
    return jsonError('Kund-ID kravs', 400);
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('customer_profiles')
    .select('stripe_subscription_id')
    .eq('id', id)
    .maybeSingle();

  if (profileError) {
    return jsonError(profileError.message || 'Kunde inte ladda kundprofilen', 500);
  }

  if (!profile?.stripe_subscription_id) {
    return new Response(JSON.stringify({ subscription: null }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=10',
      },
    });
  }

  const { data: subscription, error } = await supabaseAdmin
    .from('subscriptions')
    .select(
      'stripe_subscription_id, status, cancel_at_period_end, current_period_end, current_period_start, created',
    )
    .eq('customer_profile_id', id)
    .eq('stripe_subscription_id', profile.stripe_subscription_id)
    .order('created', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return jsonError(error.message || 'Kunde inte ladda abonnemanget', 500);
  }

  return new Response(
    JSON.stringify({
      subscription: subscription
        ? {
            stripe_subscription_id: subscription.stripe_subscription_id,
            status: subscription.status ?? '',
            cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
            current_period_end: subscription.current_period_end,
            current_period_start: subscription.current_period_start,
          }
        : null,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=10',
      },
    },
  );
}, ['admin']);
