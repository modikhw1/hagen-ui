import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { buildScheduledPriceChange } from '@/lib/admin/subscription-operational-sync';
import { isMissingColumnError } from '@/lib/admin/schema-guards';

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = (
    invoice as Stripe.Invoice & {
      parent?: {
        type?: string;
        subscription_details?: {
          subscription?: string | { id: string };
        };
      };
      subscription?: string | { id: string } | null;
    }
  ).parent;

  if (parent?.type === 'subscription_details') {
    const subscription = parent.subscription_details?.subscription;
    return typeof subscription === 'string'
      ? subscription
      : subscription?.id ?? null;
  }

  const directSubscription = (
    invoice as Stripe.Invoice & {
      subscription?: string | { id: string } | null;
    }
  ).subscription;

  return typeof directSubscription === 'string'
    ? directSubscription
    : directSubscription?.id ?? null;
}

function getInvoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
  const paymentIntent = (
    invoice as Stripe.Invoice & {
      payment_intent?: string | { id?: string | null } | null;
    }
  ).payment_intent;

  if (!paymentIntent) {
    return null;
  }

  return typeof paymentIntent === 'string'
    ? paymentIntent
    : paymentIntent.id ?? null;
}

function mapSubStatusToCustomerStatus(status: string): string {
  if (status === 'active') return 'active';
  if (status === 'trialing') return 'agreed';
  if (status === 'past_due') return 'past_due';
  if (status === 'canceled') return 'cancelled';
  if (status === 'paused') return 'pending_payment';
  return 'pending';
}

function isSubscriptionDefinitelyEnded(subscription: Stripe.Subscription, mirroredStatus: string) {
  if (subscription.cancel_at_period_end && !subscription.ended_at && !subscription.canceled_at) {
    return false;
  }

  return (
    mirroredStatus === 'canceled' ||
    Boolean(subscription.ended_at) ||
    Boolean(subscription.canceled_at)
  );
}

function extractMissingColumnName(message?: string | null) {
  if (typeof message !== 'string') return null;

  const postgrestMatch = message.match(/could not find the ['"]([a-zA-Z0-9_]+)['"] column/i);
  if (postgrestMatch?.[1]) {
    return postgrestMatch[1];
  }

  const postgresMatch = message.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/i);
  if (postgresMatch?.[1]) {
    return postgresMatch[1];
  }

  return null;
}

async function upsertWithMissingColumnFallback(params: {
  supabaseAdmin: SupabaseClient;
  table: 'invoices' | 'subscriptions';
  payload: Record<string, unknown>;
  onConflict: string;
  errorPrefix: string;
}) {
  const payload = { ...params.payload };
  const prunedColumns = new Set<string>();

  while (true) {
    const { error } = await params.supabaseAdmin
      .from(params.table)
      .upsert(payload as never, { onConflict: params.onConflict });

    if (!error) {
      return;
    }

    if (!isMissingColumnError(error.message)) {
      throw new Error(`${params.errorPrefix}: ${error.message}`);
    }

    const missingColumn = extractMissingColumnName(error.message);
    if (!missingColumn || !(missingColumn in payload) || prunedColumns.has(missingColumn)) {
      throw new Error(`${params.errorPrefix}: ${error.message}`);
    }

    delete payload[missingColumn];
    prunedColumns.add(missingColumn);
  }
}

export async function syncInvoiceLineItems(params: {
  supabaseAdmin: SupabaseClient;
  invoiceId: string;
  lineItems: Stripe.InvoiceLineItem[];
  environment: 'test' | 'live';
}) {
  const { supabaseAdmin, invoiceId, lineItems, environment } = params;
  if (!lineItems.length) return;

  const { error } = await supabaseAdmin.from('invoice_line_items').upsert(
    lineItems.map((lineItem) => {
      const stripeInvoiceItemId =
        lineItem.parent?.invoice_item_details?.invoice_item ||
        lineItem.parent?.subscription_item_details?.invoice_item ||
        null;

      return {
        stripe_line_item_id: lineItem.id,
        stripe_invoice_id: invoiceId,
        stripe_invoice_item_id: stripeInvoiceItemId,
        description: lineItem.description || '',
        amount: lineItem.amount || 0,
        currency: lineItem.currency || 'sek',
        quantity: lineItem.quantity || 1,
        period_start: lineItem.period?.start
          ? new Date(lineItem.period.start * 1000).toISOString()
          : null,
        period_end: lineItem.period?.end
          ? new Date(lineItem.period.end * 1000).toISOString()
          : null,
        data: lineItem,
        environment,
      };
    }),
    { onConflict: 'stripe_line_item_id' }
  );

  if (error) {
    throw new Error(`Failed to sync invoice line items: ${error.message}`);
  }
}

export async function upsertInvoiceMirror(params: {
  supabaseAdmin: SupabaseClient;
  invoice: Stripe.Invoice;
  environment: 'test' | 'live';
}) {
  const { supabaseAdmin, invoice, environment } = params;
  const stripeCustomerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id ?? null;
  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);

  let customerProfileId: string | null = null;
  if (stripeCustomerId) {
    const { data } = await supabaseAdmin
      .from('customer_profiles')
      .select('id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();
    customerProfileId = data?.id ?? null;
  }

  const paidAt =
    invoice.status === 'paid'
      ? invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : new Date().toISOString()
      : null;

  const subtotalOre =
    typeof invoice.subtotal === 'number' && Number.isFinite(invoice.subtotal)
      ? invoice.subtotal
      : invoice.amount_due;
  const totalOre =
    typeof invoice.total === 'number' && Number.isFinite(invoice.total)
      ? invoice.total
      : invoice.amount_due;
  const taxOre = Math.max(0, totalOre - subtotalOre);

  await upsertWithMissingColumnFallback({
    supabaseAdmin,
    table: 'invoices',
    payload: {
      stripe_invoice_id: invoice.id,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      customer_profile_id: customerProfileId,
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      subtotal_ore: subtotalOre,
      tax_ore: taxOre,
      total_ore: totalOre,
      currency: invoice.currency || 'sek',
      invoice_number: invoice.number ?? null,
      payment_intent_id: getInvoicePaymentIntentId(invoice),
      dispute_status: invoice.status === 'uncollectible' ? 'uncollectible' : null,
      status: invoice.status,
      hosted_invoice_url: invoice.hosted_invoice_url,
      invoice_pdf: invoice.invoice_pdf,
      due_date: invoice.due_date
        ? new Date(invoice.due_date * 1000).toISOString()
        : null,
      paid_at: paidAt,
      raw: invoice,
      environment,
    },
    onConflict: 'stripe_invoice_id',
    errorPrefix: 'Failed to sync invoice mirror',
  });

  if (invoice.lines?.data?.length) {
    await syncInvoiceLineItems({
      supabaseAdmin,
      invoiceId: invoice.id,
      lineItems: invoice.lines.data,
      environment,
    });
  }

  if (customerProfileId) {
    await supabaseAdmin
      .from('customer_profiles')
      .update({
        next_invoice_date: invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000)
              .toISOString()
              .slice(0, 10)
          : invoice.due_date
            ? new Date(invoice.due_date * 1000).toISOString().slice(0, 10)
            : null,
      } as never)
      .eq('id', customerProfileId);
  }
}

export async function upsertSubscriptionMirror(params: {
  supabaseAdmin: SupabaseClient;
  subscription: Stripe.Subscription;
  environment: 'test' | 'live';
}) {
  const { supabaseAdmin, subscription, environment } = params;
  const stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null;

  let customerProfileId: string | null = null;
  let operationalProfile: {
    paused_until: string | null;
    monthly_price: number | null;
    upcoming_monthly_price: number | null;
    upcoming_price_effective_date: string | null;
  } | null = null;
  if (stripeCustomerId) {
    const { data } = await supabaseAdmin
      .from('customer_profiles')
      .select('id, paused_until, monthly_price, upcoming_monthly_price, upcoming_price_effective_date')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();
    customerProfileId = data?.id ?? null;
    operationalProfile = data
      ? {
          paused_until: data.paused_until,
          monthly_price: data.monthly_price,
          upcoming_monthly_price: data.upcoming_monthly_price,
          upcoming_price_effective_date: data.upcoming_price_effective_date,
        }
      : null;
  }

  const item = subscription.items.data[0];
  const amount = item?.price?.unit_amount ?? 0;
  const interval = item?.price?.recurring?.interval ?? 'month';
  const intervalCount = item?.price?.recurring?.interval_count ?? 1;
  const mirroredStatus = subscription.pause_collection
    ? 'paused'
    : subscription.status;

  const payload = {
    stripe_subscription_id: subscription.id,
    stripe_customer_id: stripeCustomerId,
    customer_profile_id: customerProfileId,
    status: mirroredStatus,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    amount,
    interval,
    interval_count: intervalCount,
    current_period_start: item?.current_period_start
      ? new Date(item.current_period_start * 1000).toISOString()
      : null,
    current_period_end: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
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
    pause_collection: subscription.pause_collection,
    pause_until: operationalProfile?.paused_until ?? null,
    scheduled_price_change: operationalProfile
      ? buildScheduledPriceChange(operationalProfile)
      : null,
    raw: subscription,
    environment,
    created: subscription.created
      ? new Date(subscription.created * 1000).toISOString()
      : new Date().toISOString(),
  };

  await upsertWithMissingColumnFallback({
    supabaseAdmin,
    table: 'subscriptions',
    payload,
    onConflict: 'stripe_subscription_id',
    errorPrefix: 'Failed to sync subscription mirror',
  });

  if (customerProfileId) {
    const currentCustomerProfile = await supabaseAdmin
      .from('customer_profiles')
      .select('id, status, next_invoice_date')
      .eq('id', customerProfileId)
      .maybeSingle();

    await supabaseAdmin
      .from('customer_profiles')
      .update({
        stripe_subscription_id: subscription.id,
        status: mapSubStatusToCustomerStatus(mirroredStatus),
        next_invoice_date: item?.current_period_end
          ? new Date(item.current_period_end * 1000).toISOString().slice(0, 10)
          : null,
      } as never)
      .eq('id', customerProfileId);

    if (
      currentCustomerProfile.data &&
      currentCustomerProfile.data.status !== 'archived' &&
      isSubscriptionDefinitelyEnded(subscription, mirroredStatus)
    ) {
      const archivedAt = new Date().toISOString().slice(0, 10);
      const { data: archivedProfile } = await supabaseAdmin
        .from('customer_profiles')
        .update({
          status: 'archived',
          next_invoice_date: null,
        } as never)
        .eq('id', customerProfileId)
        .select('id, status, next_invoice_date')
        .maybeSingle();

      await recordAuditLog(supabaseAdmin, {
        actorUserId: null,
        actorRole: 'system',
        action: 'system.customer.auto_archived_after_subscription_end',
        entityType: 'customer_profile',
        entityId: customerProfileId,
        beforeState: currentCustomerProfile.data as Record<string, unknown>,
        afterState: (archivedProfile ?? {
          id: customerProfileId,
          status: 'archived',
          next_invoice_date: null,
        }) as Record<string, unknown>,
        metadata: {
          stripe_subscription_id: subscription.id,
          archived_on: archivedAt,
          mirrored_status: mirroredStatus,
        },
      });
    }
  }
}
