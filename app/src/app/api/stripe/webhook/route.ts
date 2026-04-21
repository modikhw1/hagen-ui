import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe, stripeEnvironment } from '@/lib/stripe/dynamic-config';
import { getStripeConfigEnvNames } from '@/lib/stripe/environment';
import {
  upsertCreditNoteMirror,
  upsertRefundMirror,
} from '@/lib/stripe/billing-adjustments';
import {
  upsertInvoiceMirror,
  upsertSubscriptionMirror,
} from '@/lib/stripe/mirror';
import {
  hasProcessedStripeEvent,
  logStripeSync,
  markStripeEventProcessed,
} from '@/lib/stripe/sync-log';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { webhookSecret } = getStripeConfigEnvNames(stripeEnvironment);
const WEBHOOK_SECRET = process.env[webhookSecret];

async function releaseInvoiceSnoozeOnEscalation(
  invoice: Stripe.Invoice
) {
  if (invoice.status !== 'open' && invoice.status !== 'uncollectible') {
    return;
  }

  const supabaseAdmin = createSupabaseAdmin();
  await supabaseAdmin
    .from('attention_snoozes')
    .update({
      released_at: new Date().toISOString(),
      release_reason: 'escalated',
    } as never)
    .eq('subject_type', 'invoice')
    .eq('subject_id', invoice.id)
    .is('released_at', null);
}

function getObjectMetadata(event: Stripe.Event) {
  return {
    objectType:
      typeof event.data.object.object === 'string'
        ? event.data.object.object
        : null,
    objectId: 'id' in event.data.object ? String(event.data.object.id) : null,
  };
}

export async function POST(req: NextRequest) {
  if (!stripe || !WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Stripe webhook not configured' },
      { status: 500 }
    );
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid webhook signature';
    return NextResponse.json({ error: `Signature: ${message}` }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdmin();
  if (await hasProcessedStripeEvent(supabaseAdmin, event.id)) {
    return NextResponse.json({ received: true, already_processed: true });
  }

  const objectMeta = getObjectMetadata(event);

  try {
    switch (event.type) {
      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.voided':
      case 'invoice.marked_uncollectible':
      case 'invoice.updated': {
        const invoice = event.data.object as Stripe.Invoice;
        await upsertInvoiceMirror({
          supabaseAdmin,
          invoice,
          environment: stripeEnvironment,
        });

        if (event.type === 'invoice.payment_failed') {
          await releaseInvoiceSnoozeOnEscalation(invoice);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        await upsertSubscriptionMirror({
          supabaseAdmin,
          subscription: event.data.object as Stripe.Subscription,
          environment: stripeEnvironment,
        });
        break;
      }

      case 'credit_note.created':
      case 'credit_note.updated': {
        const creditNote = event.data.object as Stripe.CreditNote;
        await upsertCreditNoteMirror({
          supabaseAdmin,
          creditNote,
          environment: stripeEnvironment,
        });
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        for (const refund of charge.refunds?.data ?? []) {
          await upsertRefundMirror({
            supabaseAdmin,
            refund,
            charge,
            environment: stripeEnvironment,
          });
        }
        break;
      }

      default: {
        await markStripeEventProcessed(supabaseAdmin, event.id, event.type);
        await logStripeSync({
          supabaseAdmin,
          eventId: event.id,
          eventType: event.type,
          objectType: objectMeta.objectType,
          objectId: objectMeta.objectId,
          syncDirection: 'stripe_to_supabase',
          status: 'skipped',
          environment: stripeEnvironment,
        });
        return NextResponse.json({ received: true, skipped: true });
      }
    }

    await markStripeEventProcessed(supabaseAdmin, event.id, event.type);
    await logStripeSync({
      supabaseAdmin,
      eventId: event.id,
      eventType: event.type,
      objectType: objectMeta.objectType,
      objectId: objectMeta.objectId,
      syncDirection: 'stripe_to_supabase',
      status: 'success',
      environment: stripeEnvironment,
      payloadSummary: {
        livemode: event.livemode,
        environment: stripeEnvironment,
      },
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    await logStripeSync({
      supabaseAdmin,
      eventId: event.id,
      eventType: event.type,
      objectType: objectMeta.objectType,
      objectId: objectMeta.objectId,
      syncDirection: 'stripe_to_supabase',
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Internal',
      environment: stripeEnvironment,
      payloadSummary: {
        livemode: event.livemode,
        environment: stripeEnvironment,
      },
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal' },
      { status: 500 }
    );
  }
}
