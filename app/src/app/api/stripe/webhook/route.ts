import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getSupabaseConfig, getStripeWebhookSecret } from '@/lib/env';
import { sendPaymentConfirmation } from '@/lib/email/resend';

// Lazy initialization to avoid build-time errors
function getSupabaseAdmin() {
  const config = getSupabaseConfig();
  if (!config.isConfigured || !config.serviceKey) {
    console.error('Supabase service role key not configured - webhook updates will fail');
    return createClient(config.url || 'https://placeholder.supabase.co', 'placeholder-key');
  }
  return createClient(config.url, config.serviceKey);
}

const webhookSecret = getStripeWebhookSecret();

// Invoice defaults for LeTrend branding
const INVOICE_DEFAULTS = {
  footer: 'Tack för att du väljer LeTrend. Vid frågor, kontakta faktura@letrend.se',
  memo: 'Vi ser fram emot att samarbeta med dig.',
  customFields: [
    { name: 'Kundservice', value: '+46 73 822 22 77' },
    { name: 'Webbplats', value: 'letrend.se' },
  ],
};

async function applyInvoiceDefaults(invoiceId: string) {
  try {
    await stripe.invoices.update(invoiceId, {
      footer: INVOICE_DEFAULTS.footer,
      custom_fields: INVOICE_DEFAULTS.customFields,
      description: INVOICE_DEFAULTS.memo,
    });
    console.log(`Applied invoice defaults to: ${invoiceId}`);
  } catch (err) {
    console.error('Failed to apply invoice defaults:', err);
  }
}

async function updateSubscriptionStatus(
  subscriptionId: string,
  status: string,
  userId?: string,
  planId?: string,
  currentPeriodEnd?: Date
) {
  const supabase = getSupabaseAdmin();

  // If we don't have userId, look it up from subscription_id
  let targetUserId = userId;
  if (!targetUserId) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('subscription_id', subscriptionId)
      .single();
    targetUserId = data?.id;
  }

  if (!targetUserId) {
    console.error('Could not find user for subscription:', subscriptionId);
    return;
  }

  const updateData: Record<string, unknown> = {
    subscription_status: status,
    subscription_id: subscriptionId,
    has_paid: status === 'active' || status === 'trialing',
  };

  if (planId) {
    updateData.subscription_type = planId;
  }

  if (currentPeriodEnd) {
    updateData.current_period_end = currentPeriodEnd.toISOString();
  }

  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', targetUserId);

  if (error) {
    console.error('Failed to update subscription status:', error);
  } else {
    console.log(`User ${targetUserId} subscription status: ${status}`);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event: Stripe.Event;

  // DEV MODE: Skip signature verification if no webhook secret configured
  const isDev = !webhookSecret || webhookSecret === '';

  if (isDev) {
    console.warn('⚠️ WEBHOOK DEV MODE: No STRIPE_WEBHOOK_SECRET - skipping signature verification');
    try {
      event = JSON.parse(body) as Stripe.Event;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  } else {
    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
  }

  // Helper to extract current_period_end from subscription
  const getSubPeriodEnd = (sub: unknown): number => {
    return (sub as { current_period_end: number }).current_period_end;
  };

  // Handle the event
  switch (event.type) {
    // === SUBSCRIPTION EVENTS ===
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.supabase_user_id;
      const planId = subscription.metadata?.plan_id;

      await updateSubscriptionStatus(
        subscription.id,
        subscription.status,
        userId,
        planId,
        new Date(getSubPeriodEnd(subscription) * 1000)
      );
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.supabase_user_id;

      await updateSubscriptionStatus(
        subscription.id,
        'canceled',
        userId
      );
      break;
    }

    // Apply LeTrend branding to new invoices
    case 'invoice.created': {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.status === 'draft') {
        await applyInvoiceDefaults(invoice.id);
      }
      break;
    }

    case 'invoice.paid': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice = event.data.object as any;
      const subscriptionId = invoice.subscription as string | null;

      if (subscriptionId) {
        // Subscription invoice paid - keep active
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ['items.data.price.product'],
        });
        const userId = subscription.metadata?.supabase_user_id;

        await updateSubscriptionStatus(
          subscriptionId,
          'active',
          userId,
          undefined,
          new Date(getSubPeriodEnd(subscription) * 1000)
        );

        // Send payment confirmation email
        const customerEmail = invoice.customer_email;
        const customerName = invoice.customer_name;
        const priceItem = subscription.items.data[0];
        const product = priceItem?.price?.product as Stripe.Product | undefined;
        const planName = product?.name || 'LeTrend';
        const amount = priceItem?.price?.unit_amount || invoice.amount_paid;
        const currency = invoice.currency;

        if (customerEmail) {
          await sendPaymentConfirmation(
            customerEmail,
            customerName || '',
            planName,
            amount,
            currency
          );
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as unknown as { subscription: string | null };
      const subscriptionId = invoice.subscription;

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = subscription.metadata?.supabase_user_id;

        await updateSubscriptionStatus(
          subscriptionId,
          'past_due',
          userId
        );
      }
      break;
    }

    // === LEGACY: One-time payment (keep for backwards compatibility) ===
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;

      // Only handle one-time payments here (subscriptions handled above)
      if (userId && session.mode === 'payment' && session.payment_status === 'paid') {
        const { error } = await getSupabaseAdmin()
          .from('profiles')
          .update({ has_paid: true })
          .eq('id', userId);

        if (error) {
          console.error('Failed to update has_paid:', error);
        } else {
          console.log(`User ${userId} marked as paid (one-time)`);
        }
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log('Payment failed:', paymentIntent.id);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
