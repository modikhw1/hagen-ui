import { Router, type Request, type Response } from 'express';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const router = Router();

function getStripe() {
  const key =
    process.env['STRIPE_SECRET_KEY'] ??
    process.env['STRIPE_LIVE_SECRET_KEY'] ??
    process.env['STRIPE_TEST_SECRET_KEY'];
  if (!key) return null;
  const Stripe = require('stripe');
  return new Stripe(key, { apiVersion: '2024-06-20', typescript: true });
}

function getWebhookSecret(): string | null {
  return (
    process.env['STRIPE_WEBHOOK_SECRET'] ??
    process.env['STRIPE_LIVE_WEBHOOK_SECRET'] ??
    process.env['STRIPE_TEST_WEBHOOK_SECRET'] ??
    null
  );
}

function getStripeEnvironment(): 'live' | 'test' {
  return process.env['STRIPE_ENV'] === 'live' ? 'live' : 'test';
}

function mapSubscriptionStatusToCustomerStatus(status: string): string {
  if (status === 'active') return 'active';
  if (status === 'trialing') return 'agreed';
  if (status === 'past_due') return 'past_due';
  if (status === 'canceled') return 'cancelled';
  if (status === 'paused') return 'pending_payment';
  return 'pending';
}

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

async function hasProcessedEvent(supabase: SupabaseAdmin, eventId: string): Promise<boolean> {
  const result = await supabase
    .from('stripe_processed_events' as never)
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle();
  return Boolean((result as { data: unknown }).data);
}

async function markEventProcessed(
  supabase: SupabaseAdmin,
  eventId: string,
  eventType: string,
): Promise<void> {
  const { error } = await supabase
    .from('stripe_processed_events' as never)
    .upsert({ event_id: eventId, event_type: eventType } as never, { onConflict: 'event_id' });
  if (error) {
    logger.warn({ error: error.message, eventId }, 'Failed to mark stripe event processed');
  }
}

type SyncStatus = 'received' | 'applied' | 'skipped' | 'failed';

async function logSyncEvent(
  supabase: SupabaseAdmin,
  params: {
    eventId: string;
    eventType: string;
    objectType: string | null;
    objectId: string | null;
    customerProfileId: string | null;
    status: SyncStatus;
    errorMessage?: string | null;
    appliedChanges?: Record<string, unknown>;
    payloadSummary?: Record<string, unknown>;
  },
): Promise<void> {
  const environment = getStripeEnvironment();

  await supabase
    .from('stripe_sync_events' as never)
    .insert({
      stripe_event_id: params.eventId,
      event_type: params.eventType,
      object_type: params.objectType,
      object_id: params.objectId,
      customer_profile_id: params.customerProfileId,
      source: 'webhook',
      status: params.status,
      applied_changes: params.appliedChanges ?? {},
      raw_payload: params.payloadSummary ?? null,
      error_message: params.errorMessage ?? null,
      processed_at: params.status !== 'received' ? new Date().toISOString() : null,
      environment,
    } as never);

  const legacyStatus =
    params.status === 'applied' ? 'success' : params.status === 'received' ? 'in_progress' : params.status;

  await supabase
    .from('stripe_sync_log' as never)
    .insert({
      stripe_event_id: params.eventId,
      event_id: params.eventId,
      event_type: params.eventType,
      object_type: params.objectType,
      object_id: params.objectId,
      sync_direction: 'stripe_to_supabase',
      status: legacyStatus,
      error_message: params.errorMessage ?? null,
      payload_summary: params.payloadSummary ?? null,
      environment,
    } as never);
}

async function resolveCustomerProfileId(
  supabase: SupabaseAdmin,
  stripeCustomerId: string | null,
): Promise<string | null> {
  if (!stripeCustomerId) return null;
  const { data } = await supabase
    .from('customer_profiles')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

function extractStripeCustomerId(obj: Record<string, unknown>): string | null {
  const customer = obj['customer'];
  if (typeof customer === 'string') return customer;
  if (customer && typeof customer === 'object') {
    return (customer as Record<string, unknown>)['id'] as string ?? null;
  }
  return null;
}

function extractSubscriptionId(invoice: Record<string, unknown>): string | null {
  // Stripe API v2 nests subscription under parent.subscription_details
  const parent = invoice['parent'] as Record<string, unknown> | null;
  if (parent?.['type'] === 'subscription_details') {
    const sub = (parent['subscription_details'] as Record<string, unknown> | null)?.['subscription'];
    if (typeof sub === 'string') return sub;
    if (sub && typeof sub === 'object') return (sub as Record<string, unknown>)['id'] as string ?? null;
  }
  // Legacy direct subscription field
  const sub = invoice['subscription'];
  if (typeof sub === 'string') return sub;
  if (sub && typeof sub === 'object') return (sub as Record<string, unknown>)['id'] as string ?? null;
  return null;
}

function extractPaymentIntentId(invoice: Record<string, unknown>): string | null {
  const pi = invoice['payment_intent'];
  if (typeof pi === 'string') return pi;
  if (pi && typeof pi === 'object') return (pi as Record<string, unknown>)['id'] as string ?? null;
  return null;
}

async function syncInvoice(
  supabase: SupabaseAdmin,
  invoice: Record<string, unknown>,
  customerProfileId: string | null,
): Promise<void> {
  const environment = getStripeEnvironment();
  const stripeCustomerId = extractStripeCustomerId(invoice);
  const stripeSubscriptionId = extractSubscriptionId(invoice);
  const paymentIntentId = extractPaymentIntentId(invoice);

  const statusTransitions = invoice['status_transitions'] as Record<string, unknown> | null;
  const paidAt =
    invoice['status'] === 'paid'
      ? statusTransitions?.['paid_at']
        ? new Date((statusTransitions['paid_at'] as number) * 1000).toISOString()
        : new Date().toISOString()
      : null;

  const amountDue = (invoice['amount_due'] as number) ?? 0;
  const subtotal = typeof invoice['subtotal'] === 'number' ? invoice['subtotal'] : amountDue;
  const total = typeof invoice['total'] === 'number' ? invoice['total'] : amountDue;

  const { error } = await supabase
    .from('invoices')
    .upsert(
      {
        stripe_invoice_id: invoice['id'],
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        customer_profile_id: customerProfileId,
        amount_due: amountDue,
        amount_paid: (invoice['amount_paid'] as number) ?? 0,
        subtotal_ore: subtotal,
        tax_ore: Math.max(0, total - subtotal),
        total_ore: total,
        currency: (invoice['currency'] as string) || 'sek',
        invoice_number: invoice['number'] ?? null,
        payment_intent_id: paymentIntentId,
        status: invoice['status'],
        hosted_invoice_url: invoice['hosted_invoice_url'] ?? null,
        invoice_pdf: invoice['invoice_pdf'] ?? null,
        due_date: invoice['due_date']
          ? new Date((invoice['due_date'] as number) * 1000).toISOString()
          : null,
        paid_at: paidAt,
        environment,
      } as never,
      { onConflict: 'stripe_invoice_id' },
    );

  if (error) {
    throw new Error(`Failed to upsert invoice ${invoice['id'] as string}: ${error.message}`);
  }

  if (customerProfileId && invoice['next_payment_attempt']) {
    const { error: cpError } = await supabase
      .from('customer_profiles')
      .update({
        next_invoice_date: new Date((invoice['next_payment_attempt'] as number) * 1000)
          .toISOString()
          .slice(0, 10),
      } as never)
      .eq('id', customerProfileId);
    if (cpError) {
      logger.warn({ error: cpError.message }, 'Failed to update next_invoice_date on customer_profile');
    }
  }
}

async function syncSubscription(
  supabase: SupabaseAdmin,
  subscription: Record<string, unknown>,
  customerProfileId: string | null,
): Promise<void> {
  const environment = getStripeEnvironment();
  const stripeCustomerId = extractStripeCustomerId(subscription);

  const items = (subscription['items'] as { data: Record<string, unknown>[] } | null)?.data ?? [];
  const item = items[0] as Record<string, unknown> | undefined;
  const price = item?.['price'] as Record<string, unknown> | undefined;
  const recurring = price?.['recurring'] as Record<string, unknown> | undefined;

  const pauseCollection = subscription['pause_collection'];
  const mirroredStatus = pauseCollection ? 'paused' : (subscription['status'] as string);

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        stripe_subscription_id: subscription['id'],
        stripe_customer_id: stripeCustomerId,
        customer_profile_id: customerProfileId,
        status: mirroredStatus,
        cancel_at_period_end: subscription['cancel_at_period_end'] ?? false,
        amount: (price?.['unit_amount'] as number) ?? 0,
        interval: (recurring?.['interval'] as string) ?? 'month',
        interval_count: (recurring?.['interval_count'] as number) ?? 1,
        current_period_start: item?.['current_period_start']
          ? new Date((item['current_period_start'] as number) * 1000).toISOString()
          : null,
        current_period_end: item?.['current_period_end']
          ? new Date((item['current_period_end'] as number) * 1000).toISOString()
          : null,
        trial_start: subscription['trial_start']
          ? new Date((subscription['trial_start'] as number) * 1000).toISOString()
          : null,
        trial_end: subscription['trial_end']
          ? new Date((subscription['trial_end'] as number) * 1000).toISOString()
          : null,
        canceled_at: subscription['canceled_at']
          ? new Date((subscription['canceled_at'] as number) * 1000).toISOString()
          : null,
        cancel_at: subscription['cancel_at']
          ? new Date((subscription['cancel_at'] as number) * 1000).toISOString()
          : null,
        ended_at: subscription['ended_at']
          ? new Date((subscription['ended_at'] as number) * 1000).toISOString()
          : null,
        environment,
        created: subscription['created']
          ? new Date((subscription['created'] as number) * 1000).toISOString()
          : new Date().toISOString(),
      } as never,
      { onConflict: 'stripe_subscription_id' },
    );

  if (error) {
    throw new Error(`Failed to upsert subscription ${subscription['id'] as string}: ${error.message}`);
  }

  if (customerProfileId) {
    const customerStatus = mapSubscriptionStatusToCustomerStatus(mirroredStatus);
    const nextInvoiceDate = item?.['current_period_end']
      ? new Date((item['current_period_end'] as number) * 1000).toISOString().slice(0, 10)
      : null;

    const { error: cpError } = await supabase
      .from('customer_profiles')
      .update({
        stripe_subscription_id: subscription['id'],
        status: customerStatus,
        next_invoice_date: nextInvoiceDate,
      } as never)
      .eq('id', customerProfileId);

    if (cpError) {
      logger.warn({ error: cpError.message }, 'Failed to update customer_profile from subscription sync');
    }

    const isDefinitelyEnded =
      Boolean(subscription['ended_at']) ||
      mirroredStatus === 'canceled';

    if (isDefinitelyEnded) {
      await supabase
        .from('customer_profiles')
        .update({ status: 'archived', next_invoice_date: null } as never)
        .eq('id', customerProfileId)
        .neq('status', 'archived');
    }
  }
}

// POST /api/stripe/webhook
// Mounted at /api/stripe/webhook with express.raw() middleware applied in app.ts.
router.post('/', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = getWebhookSecret();
  const stripe = getStripe();

  if (!stripe) {
    logger.error('Stripe not configured — cannot process webhook');
    res.status(500).json({ error: 'Stripe not configured' });
    return;
  }

  if (!webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET not set — rejecting webhook to prevent unauthenticated billing mutations');
    res.status(500).json({ error: 'Webhook secret not configured' });
    return;
  }

  let event: StripeEvent;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret) as StripeEvent;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    logger.warn({ message }, 'Stripe webhook signature verification failed');
    res.status(400).json({ error: `Webhook signature error: ${message}` });
    return;
  }

  const { id: eventId, type: eventType } = event;
  const eventData = event.data.object;

  const supabase = createSupabaseAdmin();

  // Idempotency guard — return 200 to Stripe; event was already handled.
  const alreadyProcessed = await hasProcessedEvent(supabase, eventId);
  if (alreadyProcessed) {
    logger.info({ eventId, eventType }, 'Stripe webhook already processed — skipping');
    res.json({ received: true, skipped: true });
    return;
  }

  // Log receipt before processing so any crash is still visible in the audit trail.
  await logSyncEvent(supabase, {
    eventId,
    eventType,
    objectType: (eventData['object'] as string) ?? null,
    objectId: (eventData['id'] as string) ?? null,
    customerProfileId: null,
    status: 'received',
  });

  const stripeCustomerId = extractStripeCustomerId(eventData);
  const customerProfileId = await resolveCustomerProfileId(supabase, stripeCustomerId);
  const objectId = (eventData['id'] as string) ?? null;
  const appliedChanges: Record<string, unknown> = {};

  try {
    switch (eventType) {
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
      case 'invoice.finalized':
      case 'invoice.updated':
      case 'invoice.payment_failed':
      case 'invoice.voided':
      case 'invoice.marked_uncollectible': {
        await syncInvoice(supabase, eventData, customerProfileId);
        appliedChanges['synced_invoice'] = objectId;
        appliedChanges['invoice_status'] = eventData['status'];
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
      case 'customer.subscription.trial_will_end': {
        await syncSubscription(supabase, eventData, customerProfileId);
        appliedChanges['synced_subscription'] = objectId;
        appliedChanges['subscription_status'] = eventData['status'];
        break;
      }

      case 'checkout.session.completed': {
        const sessionProfileId =
          ((eventData['metadata'] as Record<string, string> | null)?.['profile_id']) ?? null;
        const sessionCustomerId =
          typeof eventData['customer'] === 'string' ? eventData['customer'] : null;

        if (sessionProfileId) {
          const { error: profileUpdateError } = await supabase
            .from('customer_profiles')
            .update({
              status: 'agreed',
              ...(sessionCustomerId ? { stripe_customer_id: sessionCustomerId } : {}),
            } as never)
            .eq('id', sessionProfileId);

          if (profileUpdateError) {
            throw new Error(`Failed to update customer profile on checkout: ${profileUpdateError.message}`);
          }
          appliedChanges['updated_profile'] = sessionProfileId;
          appliedChanges['new_status'] = 'agreed';
        }

        const subscriptionId =
          typeof eventData['subscription'] === 'string' ? eventData['subscription'] : null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const subProfileId =
            sessionProfileId ?? (await resolveCustomerProfileId(supabase, sessionCustomerId));
          await syncSubscription(supabase, sub as unknown as Record<string, unknown>, subProfileId);
          appliedChanges['synced_subscription'] = subscriptionId;
        }
        break;
      }

      case 'customer.updated': {
        const email = eventData['email'] as string | null;
        if (stripeCustomerId && email) {
          const { error: emailUpdateError } = await supabase
            .from('customer_profiles')
            .update({ contact_email: email } as never)
            .eq('stripe_customer_id', stripeCustomerId);
          if (emailUpdateError) {
            throw new Error(`Failed to update customer email: ${emailUpdateError.message}`);
          }
          appliedChanges['updated_email'] = email;
        }
        break;
      }

      default: {
        logger.info({ eventType }, 'Stripe webhook: unhandled event type');
        await markEventProcessed(supabase, eventId, eventType);
        await logSyncEvent(supabase, {
          eventId,
          eventType,
          objectType: (eventData['object'] as string) ?? null,
          objectId,
          customerProfileId,
          status: 'skipped',
        });
        res.json({ received: true, handled: false });
        return;
      }
    }

    // Mark processed only after all DB writes succeed.
    await markEventProcessed(supabase, eventId, eventType);

    await logSyncEvent(supabase, {
      eventId,
      eventType,
      objectType: (eventData['object'] as string) ?? null,
      objectId,
      customerProfileId,
      status: 'applied',
      appliedChanges,
    });

    logger.info({ eventId, eventType, customerProfileId }, 'Stripe webhook processed successfully');
    res.json({ received: true, handled: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err, eventId, eventType }, 'Stripe webhook handler error');

    await logSyncEvent(supabase, {
      eventId,
      eventType,
      objectType: (eventData['object'] as string) ?? null,
      objectId,
      customerProfileId,
      status: 'failed',
      errorMessage: message,
    });

    // Return 500 so Stripe retries the event. We do NOT mark it as processed,
    // so idempotency allows safe re-processing on the next delivery attempt.
    res.status(500).json({ error: 'Webhook processing failed — will be retried by Stripe' });
  }
});

export default router;
