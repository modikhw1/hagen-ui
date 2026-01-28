import { NextRequest, NextResponse } from 'next/server';
import { stripe, SUBSCRIPTION_PLANS, SubscriptionPlanId } from '@/lib/stripe/config';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Betalning ej konfigurerad. Kontakta support.' },
        { status: 503 }
      );
    }

    const { userId, userEmail, planId } = await request.json();

    if (!userId || !userEmail) {
      return NextResponse.json(
        { error: 'userId och userEmail krävs' },
        { status: 400 }
      );
    }

    if (!planId || !(planId in SUBSCRIPTION_PLANS)) {
      return NextResponse.json(
        { error: 'Ogiltigt paket' },
        { status: 400 }
      );
    }

    const plan = SUBSCRIPTION_PLANS[planId as SubscriptionPlanId];
    let customerId: string | undefined;

    // Get or create Stripe customer
    if (supabaseAdmin) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', userId)
        .single();

      customerId = profile?.stripe_customer_id;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: { supabase_user_id: userId },
        });
        customerId = customer.id;

        await supabaseAdmin
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', userId);
      }
    }

    // Create subscription checkout session
    const session = await stripe.checkout.sessions.create({
      ...(customerId && { customer: customerId }),
      customer_email: customerId ? undefined : userEmail,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: plan.currency,
            product_data: {
              name: plan.name,
              description: plan.description,
            },
            unit_amount: plan.price,
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${request.nextUrl.origin}/?subscription=success`,
      cancel_url: `${request.nextUrl.origin}/?subscription=cancelled`,
      metadata: {
        supabase_user_id: userId,
        plan_id: planId,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: userId,
          plan_id: planId,
        },
      },
      // Enable automatic invoicing
      invoice_creation: undefined, // Not needed for subscriptions - automatic
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe subscription error:', error);
    return NextResponse.json(
      { error: 'Kunde inte skapa prenumeration' },
      { status: 500 }
    );
  }
}
