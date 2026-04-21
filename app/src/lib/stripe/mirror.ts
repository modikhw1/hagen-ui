import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

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

function mapSubStatusToCustomerStatus(
  status: string,
  cancelAtEnd: boolean
): string {
  if (status === 'active' && !cancelAtEnd) return 'active';
  if (status === 'trialing') return 'agreed';
  if (status === 'past_due') return 'past_due';
  if (status === 'canceled') return 'cancelled';
  if (status === 'paused') return 'pending_payment';
  return 'pending';
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

  const { error: invoiceError } = await supabaseAdmin.from('invoices').upsert(
    {
      stripe_invoice_id: invoice.id,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      customer_profile_id: customerProfileId,
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      currency: invoice.currency || 'sek',
      status: invoice.status,
      hosted_invoice_url: invoice.hosted_invoice_url,
      invoice_pdf: invoice.invoice_pdf,
      due_date: invoice.due_date
        ? new Date(invoice.due_date * 1000).toISOString()
        : null,
      paid_at: paidAt,
      environment,
    } as never,
    { onConflict: 'stripe_invoice_id' }
  );

  if (invoiceError) {
    throw new Error(`Failed to sync invoice mirror: ${invoiceError.message}`);
  }

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
  if (stripeCustomerId) {
    const { data } = await supabaseAdmin
      .from('customer_profiles')
      .select('id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();
    customerProfileId = data?.id ?? null;
  }

  const item = subscription.items.data[0];
  const amount = item?.price?.unit_amount ?? 0;
  const interval = item?.price?.recurring?.interval ?? 'month';
  const intervalCount = item?.price?.recurring?.interval_count ?? 1;
  const mirroredStatus = subscription.pause_collection
    ? 'paused'
    : subscription.status;

  const { error: subscriptionError } = await supabaseAdmin.from('subscriptions').upsert(
    {
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
      environment,
      created: subscription.created
        ? new Date(subscription.created * 1000).toISOString()
        : new Date().toISOString(),
    } as never,
    { onConflict: 'stripe_subscription_id' }
  );

  if (subscriptionError) {
    throw new Error(
      `Failed to sync subscription mirror: ${subscriptionError.message}`
    );
  }

  if (customerProfileId) {
    await supabaseAdmin
      .from('customer_profiles')
      .update({
        stripe_subscription_id: subscription.id,
        status: mapSubStatusToCustomerStatus(
          mirroredStatus,
          subscription.cancel_at_period_end ?? false
        ),
        next_invoice_date: item?.current_period_end
          ? new Date(item.current_period_end * 1000).toISOString().slice(0, 10)
          : null,
      } as never)
      .eq('id', customerProfileId);
  }
}
