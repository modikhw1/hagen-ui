import { NextRequest, NextResponse } from 'next/server';
import { stripe, stripeWebhookSecret } from '@/lib/stripe/dynamic-config';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Handles new Stripe API shape: invoice.parent.subscription_details.subscription
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as unknown as { parent?: { type?: string; subscription_details?: { subscription?: string | { id: string } } } }).parent;
  if (parent?.type === 'subscription_details') {
    const sub = parent.subscription_details?.subscription;
    if (sub) return typeof sub === 'string' ? sub : sub.id;
  }
  // Fallback for older API shape
  return (invoice as unknown as { subscription?: string | null }).subscription ?? null;
}

// Email sending with Resend
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'LeTrend <onboarding@resend.dev>';

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured - skipping email');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend error:', error);
      return false;
    }

    console.log(`Email sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

async function sendPaymentConfirmation(email: string, customerName: string, amount: number, currency: string) {
  const formattedAmount = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amount / 100);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1A1612; }
    .container { max-width: 500px; margin: 0 auto; padding: 40px 20px; }
    .logo { text-align: center; margin-bottom: 32px; }
    .logo-circle { display: inline-block; width: 48px; height: 48px; background: #6B4423; border-radius: 50%; line-height: 48px; color: #FAF8F5; font-family: Georgia, serif; font-style: italic; }
    .card { background: #FAF8F5; border-radius: 12px; padding: 32px; margin-bottom: 24px; }
    .success { color: #22863A; font-size: 24px; margin-bottom: 8px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    .details { background: #FFFFFF; border-radius: 8px; padding: 20px; margin-top: 20px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .label { color: #6B5B4F; }
    .value { font-weight: 600; }
    .footer { text-align: center; font-size: 14px; color: #6B5B4F; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <span class="logo-circle">Le</span>
    </div>

    <div class="card">
      <div class="success">✓</div>
      <h1>Tack för din betalning!</h1>
      <p>Hej ${customerName || 'där'},</p>
      <p>Din betalning har genomförts och ditt avtal är nu aktivt.</p>

      <div class="details">
        <div class="row">
          <span class="label">Belopp</span>
          <span class="value">${formattedAmount}</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>Har du frågor? Kontakta oss på <a href="mailto:kontakt@letrend.se" style="color: #6B4423;">kontakt@letrend.se</a></p>
      <p style="color: #A89080;">LeTrend AB</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail(email, 'Betalningsbekräftelse - LeTrend', html);
}

// POST - Handle Stripe webhooks
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  const webhookSecret = stripeWebhookSecret;

  let event;

  // Always require webhook secret - no dev mode bypass for security
  if (!webhookSecret) {
    console.error('❌ STRIPE_WEBHOOK_SECRET not configured - rejecting webhook');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 }
    );
  }

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  console.log('Webhook received:', event.type);

  const supabase = getSupabaseAdmin();

  // PHASE 2.2: Check idempotency - has this event already been processed?
  const { data: existingLog } = await supabase
    .from('stripe_sync_log')
    .select('id, status')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (existingLog) {
    console.log(`Event ${event.id} already processed with status: ${existingLog.status}`);
    return NextResponse.json({ received: true, already_processed: true });
  }

  try {
    switch (event.type) {
      // PHASE 2.1: Invoice lifecycle events
      case 'invoice.created': {
        const invoice = event.data.object;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        console.log(`Processing invoice.created: ${invoice.id}`);

        await supabase.from('invoices').insert({
          stripe_invoice_id: invoice.id,
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: invoice.customer as string,
          amount_due: invoice.amount_due,
          amount_paid: 0,
          currency: invoice.currency,
          status: invoice.status as string,
          hosted_invoice_url: invoice.hosted_invoice_url || null,
          due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
        });

        // Log successful sync
        await supabase.from('stripe_sync_log').insert({
          event_type: event.type,
          stripe_event_id: event.id,
          object_type: 'invoice',
          object_id: invoice.id,
          sync_direction: 'stripe_to_supabase',
          status: 'success',
        });
        break;
      }

      case 'invoice.finalized': {
        const invoice = event.data.object;
        console.log(`Processing invoice.finalized: ${invoice.id}`);

        await supabase.from('invoices').update({
          status: invoice.status as string,
          hosted_invoice_url: invoice.hosted_invoice_url || null,
          invoice_pdf: invoice.invoice_pdf || null,
        }).eq('stripe_invoice_id', invoice.id);

        await supabase.from('stripe_sync_log').insert({
          event_type: event.type,
          stripe_event_id: event.id,
          object_type: 'invoice',
          object_id: invoice.id,
          sync_direction: 'stripe_to_supabase',
          status: 'success',
        });
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        console.log(`Processing invoice.paid: ${invoice.id}`);

        // Update invoice status in database
        await supabase.from('invoices').update({
          status: 'paid',
          amount_paid: invoice.amount_paid,
          paid_at: new Date().toISOString(),
        }).eq('stripe_invoice_id', invoice.id);

        if (subscriptionId) {
          // Find user by subscription_id
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id')
            .eq('subscription_id', subscriptionId)
            .limit(1);

          if (profiles && profiles.length > 0) {
            await supabase
              .from('profiles')
              .update({
                subscription_status: 'active',
                has_paid: true,
              })
              .eq('id', profiles[0].id);
          }

          // Also update customer_profiles
          await supabase
            .from('customer_profiles')
            .update({ status: 'active' })
            .eq('stripe_subscription_id', subscriptionId);

          // Send confirmation email
          const customerEmail = invoice.customer_email;
          const customerName = invoice.customer_name;
          if (customerEmail) {
            await sendPaymentConfirmation(
              customerEmail,
              customerName || '',
              invoice.amount_paid,
              invoice.currency
            );
          }
        }

        await supabase.from('stripe_sync_log').insert({
          event_type: event.type,
          stripe_event_id: event.id,
          object_type: 'invoice',
          object_id: invoice.id,
          sync_direction: 'stripe_to_supabase',
          status: 'success',
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        console.log(`Processing invoice.payment_failed: ${invoice.id}`);

        // Update invoice status
        await supabase.from('invoices').update({
          status: 'open', // or keep original status
        }).eq('stripe_invoice_id', invoice.id);

        if (subscriptionId) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id')
            .eq('subscription_id', subscriptionId)
            .limit(1);

          if (profiles && profiles.length > 0) {
            await supabase
              .from('profiles')
              .update({ subscription_status: 'past_due' })
              .eq('id', profiles[0].id);
          }

          // Update customer_profiles
          await supabase
            .from('customer_profiles')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', subscriptionId);
        }

        await supabase.from('stripe_sync_log').insert({
          event_type: event.type,
          stripe_event_id: event.id,
          object_type: 'invoice',
          object_id: invoice.id,
          sync_direction: 'stripe_to_supabase',
          status: 'success',
        });
        break;
      }

      case 'invoice.voided': {
        const invoice = event.data.object;
        console.log(`Processing invoice.voided: ${invoice.id}`);

        await supabase.from('invoices').update({
          status: 'void',
        }).eq('stripe_invoice_id', invoice.id);

        await supabase.from('stripe_sync_log').insert({
          event_type: event.type,
          stripe_event_id: event.id,
          object_type: 'invoice',
          object_id: invoice.id,
          sync_direction: 'stripe_to_supabase',
          status: 'success',
        });
        break;
      }

      // PHASE 2.1: Subscription lifecycle events
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        console.log(`Processing ${event.type}: ${subscription.id}`);

        // Get customer_profile_id for linking
        const { data: customerProfile } = await supabase
          .from('customer_profiles')
          .select('id')
          .eq('stripe_customer_id', subscription.customer as string)
          .single();

        // Extract subscription price info
        const firstItem = subscription.items?.data[0];
        const amount = firstItem?.price?.unit_amount || 0;
        const interval = firstItem?.price?.recurring?.interval || 'month';
        const intervalCount = firstItem?.price?.recurring?.interval_count || 1;

        // Upsert into subscriptions table
        await supabase
          .from('subscriptions')
          .upsert({
            stripe_subscription_id: subscription.id,
            stripe_customer_id: subscription.customer as string,
            customer_profile_id: customerProfile?.id || null,
            status: subscription.status as string,
            cancel_at_period_end: subscription.cancel_at_period_end || false,
            currency: subscription.currency || 'sek',
            amount,
            interval,
            interval_count: intervalCount,
            current_period_start: subscription.current_period_start
              ? new Date(subscription.current_period_start * 1000).toISOString()
              : null,
            current_period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
            trial_start: subscription.trial_start
              ? new Date(subscription.trial_start * 1000).toISOString()
              : null,
            trial_end: subscription.trial_end
              ? new Date(subscription.trial_end * 1000).toISOString()
              : null,
            canceled_at: subscription.canceled_at
              ? new Date(subscription.canceled_at * 1000).toISOString()
              : null,
            cancel_at: subscription.cancel_at
              ? new Date(subscription.cancel_at * 1000).toISOString()
              : null,
            ended_at: subscription.ended_at
              ? new Date(subscription.ended_at * 1000).toISOString()
              : null,
            created: subscription.created
              ? new Date(subscription.created * 1000).toISOString()
              : new Date().toISOString(),
          }, {
            onConflict: 'stripe_subscription_id'
          });

        // Update customer_profiles with subscription info
        await supabase
          .from('customer_profiles')
          .update({
            stripe_subscription_id: subscription.id,
            status: subscription.status === 'active' ? 'active' : 'pending',
          })
          .eq('stripe_customer_id', subscription.customer as string);

        // Also update profiles table if it has subscription tracking
        await supabase
          .from('profiles')
          .update({
            subscription_id: subscription.id,
            subscription_status: subscription.status as string,
            current_period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
          })
          .eq('stripe_customer_id', subscription.customer as string);

        await supabase.from('stripe_sync_log').insert({
          event_type: event.type,
          stripe_event_id: event.id,
          object_type: 'subscription',
          object_id: subscription.id,
          sync_direction: 'stripe_to_supabase',
          status: 'success',
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        console.log(`Processing customer.subscription.deleted: ${subscription.id}`);

        // Update subscriptions table
        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            ended_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        await supabase
          .from('customer_profiles')
          .update({ status: 'cancelled' })
          .eq('stripe_subscription_id', subscription.id);

        await supabase
          .from('profiles')
          .update({ subscription_status: 'cancelled' })
          .eq('subscription_id', subscription.id);

        await supabase.from('stripe_sync_log').insert({
          event_type: event.type,
          stripe_event_id: event.id,
          object_type: 'subscription',
          object_id: subscription.id,
          sync_direction: 'stripe_to_supabase',
          status: 'success',
        });
        break;
      }

      // PHASE 2.1: Customer events
      case 'customer.created':
      case 'customer.updated': {
        const customer = event.data.object;
        console.log(`Processing ${event.type}: ${customer.id}`);

        // Update customer_profiles if exists
        await supabase
          .from('customer_profiles')
          .update({
            stripe_customer_id: customer.id,
          })
          .eq('stripe_customer_id', customer.id);

        await supabase.from('stripe_sync_log').insert({
          event_type: event.type,
          stripe_event_id: event.id,
          object_type: 'customer',
          object_id: customer.id,
          sync_direction: 'stripe_to_supabase',
          status: 'success',
        });
        break;
      }

      default:
        console.log('Unhandled event:', event.type);
        await supabase.from('stripe_sync_log').insert({
          event_type: event.type,
          stripe_event_id: event.id,
          object_type: 'other',
          object_id: null,
          sync_direction: 'stripe_to_supabase',
          status: 'success',
        });
    }
  } catch (error: any) {
    console.error(`Error processing webhook ${event.type}:`, error);

    // Log failed sync
    await supabase.from('stripe_sync_log').insert({
      event_type: event.type,
      stripe_event_id: event.id,
      object_type: 'unknown',
      object_id: null,
      sync_direction: 'stripe_to_supabase',
      status: 'failed',
      error_message: error.message || 'Unknown error',
    });

    // Return 500 so Stripe retries
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
