import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/dynamic-config';
import { AuthError, validateApiRequest } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await validateApiRequest(request, ['admin']);

    if (!stripe) {
      return NextResponse.json({ balance_ore: 0, currency: 'sek', stripe_unavailable: true });
    }

    const { id } = await context.params;
    const supabase = createSupabaseAdmin();
    const { data: profile, error } = await supabase
      .from('customer_profiles')
      .select('stripe_customer_id')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const stripeCustomerId = profile?.stripe_customer_id;
    if (!stripeCustomerId) {
      return NextResponse.json({ balance_ore: 0, currency: 'sek', stripe_customer_id: null });
    }

    const customer = await stripe.customers.retrieve(stripeCustomerId);
    if (customer.deleted) {
      return NextResponse.json({ balance_ore: 0, currency: 'sek', stripe_customer_id: stripeCustomerId, deleted: true });
    }

    // Stripe convention: negative = credit (will reduce next invoice).
    return NextResponse.json({
      balance_ore: customer.balance ?? 0,
      currency: customer.currency ?? 'sek',
      stripe_customer_id: stripeCustomerId,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load balance' },
      { status: 500 },
    );
  }
}
