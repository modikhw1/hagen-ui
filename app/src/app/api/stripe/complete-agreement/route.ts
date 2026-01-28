import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

// POST - Create checkout session to complete pending agreement
export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { userId, customerId, subscriptionId, invoiceId } = await request.json();

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID required' }, { status: 400 });
    }

    // Update Supabase profile with Stripe customer ID if we have userId
    if (supabaseAdmin && userId) {
      await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    // If there's a pending invoice
    if (invoiceId) {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      const successUrl = `${request.nextUrl.origin}/?agreement=completed`;

      // If already paid, redirect to success
      if (invoice.status === 'paid') {
        return NextResponse.json({ url: successUrl, paid: true });
      }

      // Finalize if draft
      if (invoice.status === 'draft') {
        await stripe.invoices.finalizeInvoice(invoiceId);
      }

      // Return hosted invoice URL - user will open in new tab
      // and we'll poll for payment status
      const updatedInvoice = await stripe.invoices.retrieve(invoiceId);
      return NextResponse.json({
        url: updatedInvoice.hosted_invoice_url,
        invoiceId: invoiceId,
        openInNewTab: true, // Signal to frontend to open in new tab
        successUrl: successUrl,
      });
    }

    // If there's a subscription, get payment intent or create checkout
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice.payment_intent'],
      });

      // Get the latest invoice
      const latestInvoice = subscription.latest_invoice;

      if (latestInvoice && typeof latestInvoice === 'object') {
        // If invoice has hosted URL, use that
        if (latestInvoice.hosted_invoice_url) {
          return NextResponse.json({ url: latestInvoice.hosted_invoice_url });
        }

        // If there's a payment intent with client secret, we could use that
        // But for simplicity, let's create a new checkout session for the subscription
      }

      // Create a checkout session to collect payment for the subscription
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: subscription.items.data.map(item => ({
          price: item.price.id,
          quantity: item.quantity || 1,
        })),
        success_url: `${request.nextUrl.origin}/?agreement=completed`,
        cancel_url: `${request.nextUrl.origin}/?agreement=cancelled`,
        metadata: {
          supabase_user_id: userId || '',
          subscription_id: subscriptionId,
        },
        subscription_data: {
          metadata: {
            supabase_user_id: userId || '',
          },
        },
      });

      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json({ error: 'No pending agreement found' }, { status: 404 });

  } catch (error) {
    console.error('Error completing agreement:', error);
    return NextResponse.json(
      { error: 'Could not complete agreement' },
      { status: 500 }
    );
  }
}
