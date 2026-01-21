import { NextRequest, NextResponse } from 'next/server';
import { stripe, PRODUCTS } from '@/lib/stripe/config';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client (optional - only if service role key is set)
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function POST(request: NextRequest) {
  try {
    // Check if Stripe is configured
    if (!stripe) {
      console.error('Stripe not configured - missing STRIPE_SECRET_KEY');
      return NextResponse.json(
        { error: 'Betalning ej konfigurerad. Kontakta support.' },
        { status: 503 }
      );
    }

    const { userId, userEmail } = await request.json();

    if (!userId || !userEmail) {
      return NextResponse.json(
        { error: 'userId och userEmail krävs' },
        { status: 400 }
      );
    }

    let customerId: string | undefined;

    // Only check/save customer ID if we have admin access
    if (supabaseAdmin) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', userId)
        .single();

      customerId = profile?.stripe_customer_id;

      // Create customer if doesn't exist
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: { supabase_user_id: userId },
        });
        customerId = customer.id;

        // Save customer ID to profile
        await supabaseAdmin
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', userId);
      }
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      ...(customerId && { customer: customerId }),
      customer_email: customerId ? undefined : userEmail,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: PRODUCTS.conceptPack.currency,
            product_data: {
              name: PRODUCTS.conceptPack.name,
              description: PRODUCTS.conceptPack.description,
            },
            unit_amount: PRODUCTS.conceptPack.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${request.nextUrl.origin}/app?payment=success`,
      cancel_url: `${request.nextUrl.origin}/app?payment=cancelled`,
      metadata: {
        supabase_user_id: userId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      { error: 'Kunde inte skapa checkout-session' },
      { status: 500 }
    );
  }
}
