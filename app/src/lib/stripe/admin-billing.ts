import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { getStripeEnvironment } from '@/lib/stripe/environment';

type DiscountProfileType = 'none' | 'percent' | 'amount' | 'free_months';

interface CustomerStripeState {
  id: string;
  business_name: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export interface BillingDiscountInput {
  type: 'percent' | 'amount' | 'free_period';
  value: number;
  durationMonths: number | null;
  ongoing: boolean;
}

export interface PendingInvoiceItemInput {
  description: string;
  amountSek: number;
  currency?: string;
}

export interface ManualInvoiceItemInput {
  description: string;
  amountSek: number;
}

function getEnvironment() {
  return getStripeEnvironment();
}

async function getCustomerStripeState(
  supabaseAdmin: SupabaseClient,
  profileId: string
): Promise<CustomerStripeState> {
  const { data, error } = await supabaseAdmin
    .from('customer_profiles')
    .select('id, business_name, stripe_customer_id, stripe_subscription_id')
    .eq('id', profileId)
    .single<CustomerStripeState>();

  if (error || !data) {
    throw new Error(error?.message || 'Kundprofil hittades inte');
  }

  return data;
}

async function logStripeAdminAction(
  supabaseAdmin: SupabaseClient,
  payload: {
    eventType: string;
    objectType: 'customer' | 'subscription' | 'invoice' | 'other';
    objectId: string | null;
    status: 'success' | 'failed';
    errorMessage?: string | null;
  }
) {
  await supabaseAdmin.from('stripe_sync_log').insert({
    event_type: payload.eventType,
    stripe_event_id: `${payload.eventType}_${payload.objectId || 'n-a'}_${Date.now()}`,
    object_type: payload.objectType,
    object_id: payload.objectId,
    sync_direction: 'supabase_to_stripe',
    status: payload.status,
    error_message: payload.errorMessage || null,
  });
}

function buildCouponDuration(input: BillingDiscountInput): Pick<
  Stripe.CouponCreateParams,
  'duration' | 'duration_in_months'
> {
  if (input.ongoing) {
    return { duration: 'forever' };
  }

  if (!input.durationMonths || input.durationMonths <= 1) {
    return { duration: 'once' };
  }

  return {
    duration: 'repeating',
    duration_in_months: input.durationMonths,
  };
}

function buildCouponParams(customerName: string, input: BillingDiscountInput): Stripe.CouponCreateParams {
  const duration = buildCouponDuration(input);
  const base: Stripe.CouponCreateParams = {
    name: `${customerName} admin discount`,
    currency: input.type === 'amount' ? 'sek' : undefined,
    ...duration,
    metadata: {
      source: 'admin_billing',
      kind: input.type,
      environment: getEnvironment(),
    },
  };

  if (input.type === 'percent') {
    return {
      ...base,
      percent_off: Math.max(0, Math.min(100, input.value)),
    };
  }

  if (input.type === 'amount') {
    return {
      ...base,
      amount_off: Math.round(Math.max(0, input.value) * 100),
      currency: 'sek',
    };
  }

  return {
    ...base,
    percent_off: 100,
  };
}

function buildDiscountProfileUpdate(input: BillingDiscountInput) {
  const now = new Date();
  const startDate = now.toISOString().slice(0, 10);
  const endDate = !input.ongoing && input.durationMonths && input.durationMonths > 0
    ? new Date(now.getFullYear(), now.getMonth() + input.durationMonths, now.getDate()).toISOString().slice(0, 10)
    : null;

  const discountType: DiscountProfileType =
    input.type === 'free_period' ? 'free_months' : input.type;

  return {
    discount_type: discountType,
    discount_value:
      input.type === 'free_period'
        ? Number(input.durationMonths || 0)
        : Math.max(0, Math.round(input.value)),
    discount_duration_months: input.ongoing ? null : input.durationMonths,
    discount_start_date: startDate,
    discount_end_date: endDate,
  };
}

export async function applyCustomerDiscount(params: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  profileId: string;
  input: BillingDiscountInput;
}) {
  const { supabaseAdmin, stripeClient, profileId, input } = params;
  if (!stripeClient) {
    throw new Error('Stripe är inte konfigurerat');
  }

  const customer = await getCustomerStripeState(supabaseAdmin, profileId);
  if (!customer.stripe_subscription_id) {
    throw new Error('Kunden saknar aktiv Stripe-prenumeration');
  }

  const coupon = await stripeClient.coupons.create(buildCouponParams(customer.business_name, input));
  await stripeClient.subscriptions.update(customer.stripe_subscription_id, {
    discounts: [{ coupon: coupon.id }],
  });

  const { data: profile, error } = await supabaseAdmin
    .from('customer_profiles')
    .update(buildDiscountProfileUpdate(input))
    .eq('id', profileId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await logStripeAdminAction(supabaseAdmin, {
    eventType: 'customer.discount_applied',
    objectType: 'subscription',
    objectId: customer.stripe_subscription_id,
    status: 'success',
  });

  return { profile, couponId: coupon.id };
}

export async function removeCustomerDiscount(params: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  profileId: string;
}) {
  const { supabaseAdmin, stripeClient, profileId } = params;
  if (!stripeClient) {
    throw new Error('Stripe är inte konfigurerat');
  }

  const customer = await getCustomerStripeState(supabaseAdmin, profileId);
  if (!customer.stripe_subscription_id) {
    throw new Error('Kunden saknar aktiv Stripe-prenumeration');
  }

  await stripeClient.subscriptions.update(customer.stripe_subscription_id, {
    discounts: [],
  });

  const { data: profile, error } = await supabaseAdmin
    .from('customer_profiles')
    .update({
      discount_type: 'none',
      discount_value: 0,
      discount_duration_months: null,
      discount_start_date: null,
      discount_end_date: null,
    })
    .eq('id', profileId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await logStripeAdminAction(supabaseAdmin, {
    eventType: 'customer.discount_removed',
    objectType: 'subscription',
    objectId: customer.stripe_subscription_id,
    status: 'success',
  });

  return { profile };
}

export async function listPendingInvoiceItems(params: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  profileId: string;
}) {
  const { supabaseAdmin, stripeClient, profileId } = params;
  if (!stripeClient) {
    throw new Error('Stripe är inte konfigurerat');
  }

  const customer = await getCustomerStripeState(supabaseAdmin, profileId);
  if (!customer.stripe_customer_id) {
    throw new Error('Kunden saknar Stripe customer');
  }

  const result = await stripeClient.invoiceItems.list({
    customer: customer.stripe_customer_id,
    pending: true,
    limit: 100,
  });

  return result.data.map((item) => ({
    id: item.id,
    description: item.description || '',
    amount_ore: item.amount,
    amount_sek: item.amount / 100,
    currency: item.currency,
    created: item.date ? new Date(item.date * 1000).toISOString() : null,
  }));
}

export async function createPendingInvoiceItem(params: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  profileId: string;
  input: PendingInvoiceItemInput;
}) {
  const { supabaseAdmin, stripeClient, profileId, input } = params;
  if (!stripeClient) {
    throw new Error('Stripe är inte konfigurerat');
  }

  const customer = await getCustomerStripeState(supabaseAdmin, profileId);
  if (!customer.stripe_customer_id) {
    throw new Error('Kunden saknar Stripe customer');
  }

  const invoiceItem = await stripeClient.invoiceItems.create({
    customer: customer.stripe_customer_id,
    amount: Math.round(Math.max(0, input.amountSek) * 100),
    currency: (input.currency || 'sek').toLowerCase(),
    description: input.description,
    metadata: {
      customer_profile_id: profileId,
      source: 'admin_invoice_item',
      environment: getEnvironment(),
    },
  });

  await logStripeAdminAction(supabaseAdmin, {
    eventType: 'invoice_item.created',
    objectType: 'invoice',
    objectId: invoiceItem.id,
    status: 'success',
  });

  return invoiceItem;
}

export async function deletePendingInvoiceItem(params: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  itemId: string;
}) {
  const { supabaseAdmin, stripeClient, itemId } = params;
  if (!stripeClient) {
    throw new Error('Stripe är inte konfigurerat');
  }

  await stripeClient.invoiceItems.del(itemId);
  await logStripeAdminAction(supabaseAdmin, {
    eventType: 'invoice_item.deleted',
    objectType: 'invoice',
    objectId: itemId,
    status: 'success',
  });
}

export async function createManualInvoice(params: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  profileId: string;
  items: ManualInvoiceItemInput[];
  daysUntilDue: number;
  autoFinalize: boolean;
}) {
  const { supabaseAdmin, stripeClient, profileId, items, daysUntilDue, autoFinalize } = params;
  if (!stripeClient) {
    throw new Error('Stripe är inte konfigurerat');
  }

  const customer = await getCustomerStripeState(supabaseAdmin, profileId);
  if (!customer.stripe_customer_id) {
    throw new Error('Kunden saknar Stripe customer');
  }

  for (const item of items) {
    await stripeClient.invoiceItems.create({
      customer: customer.stripe_customer_id,
      amount: Math.round(Math.max(0, item.amountSek) * 100),
      currency: 'sek',
      description: item.description,
      metadata: {
        customer_profile_id: profileId,
        source: 'admin_manual_invoice',
        environment: getEnvironment(),
      },
    });
  }

  const createdInvoice = await stripeClient.invoices.create({
    customer: customer.stripe_customer_id,
    collection_method: 'send_invoice',
    days_until_due: Math.max(1, daysUntilDue),
    metadata: {
      customer_profile_id: profileId,
      source: 'admin_manual_invoice',
      environment: getEnvironment(),
    },
  });

  const invoice = autoFinalize
    ? await stripeClient.invoices.finalizeInvoice(createdInvoice.id)
    : createdInvoice;

  await logStripeAdminAction(supabaseAdmin, {
    eventType: 'invoice.created_manual',
    objectType: 'invoice',
    objectId: invoice.id,
    status: 'success',
  });

  return invoice;
}

export async function cancelCustomerSubscription(params: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  profileId: string;
}) {
  const { supabaseAdmin, stripeClient, profileId } = params;
  if (!stripeClient) {
    throw new Error('Stripe är inte konfigurerat');
  }

  const customer = await getCustomerStripeState(supabaseAdmin, profileId);
  if (!customer.stripe_subscription_id) {
    throw new Error('Kunden saknar Stripe-prenumeration');
  }

  const subscription = await stripeClient.subscriptions.cancel(customer.stripe_subscription_id);
  await logStripeAdminAction(supabaseAdmin, {
    eventType: 'subscription.canceled_admin',
    objectType: 'subscription',
    objectId: subscription.id,
    status: 'success',
  });

  return subscription;
}

export async function pauseCustomerSubscription(params: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  profileId: string;
}) {
  const { supabaseAdmin, stripeClient, profileId } = params;
  if (!stripeClient) {
    throw new Error('Stripe är inte konfigurerat');
  }

  const customer = await getCustomerStripeState(supabaseAdmin, profileId);
  if (!customer.stripe_subscription_id) {
    throw new Error('Kunden saknar Stripe-prenumeration');
  }

  const subscription = await stripeClient.subscriptions.update(customer.stripe_subscription_id, {
    pause_collection: { behavior: 'void' },
  });

  await logStripeAdminAction(supabaseAdmin, {
    eventType: 'subscription.paused_admin',
    objectType: 'subscription',
    objectId: subscription.id,
    status: 'success',
  });

  return subscription;
}

export async function resumeCustomerSubscription(params: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  profileId: string;
}) {
  const { supabaseAdmin, stripeClient, profileId } = params;
  if (!stripeClient) {
    throw new Error('Stripe är inte konfigurerat');
  }

  const customer = await getCustomerStripeState(supabaseAdmin, profileId);
  if (!customer.stripe_subscription_id) {
    throw new Error('Kunden saknar Stripe-prenumeration');
  }

  const existing = await stripeClient.subscriptions.retrieve(customer.stripe_subscription_id);
  if (existing.status === 'canceled') {
    throw new Error('En avslutad prenumeration kan inte återupptas');
  }

  const subscription = await stripeClient.subscriptions.update(customer.stripe_subscription_id, {
    cancel_at_period_end: false,
    pause_collection: '',
  });

  await logStripeAdminAction(supabaseAdmin, {
    eventType: 'subscription.resumed_admin',
    objectType: 'subscription',
    objectId: subscription.id,
    status: 'success',
  });

  return subscription;
}

export async function archiveStripeCustomer(params: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  profileId: string;
}) {
  const { supabaseAdmin, stripeClient, profileId } = params;
  const customer = await getCustomerStripeState(supabaseAdmin, profileId);
  let cleanupSummary = 'No Stripe records found';

  if (stripeClient && customer.stripe_subscription_id) {
    try {
      await stripeClient.subscriptions.cancel(customer.stripe_subscription_id);
      cleanupSummary = `Canceled subscription ${customer.stripe_subscription_id}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Stripe error';
      await logStripeAdminAction(supabaseAdmin, {
        eventType: 'customer.delete_cleanup_failed',
        objectType: 'subscription',
        objectId: customer.stripe_subscription_id,
        status: 'failed',
        errorMessage: message,
      });
      throw new Error(message);
    }
  }

  if (stripeClient && customer.stripe_customer_id) {
    await stripeClient.customers.update(customer.stripe_customer_id, {
      metadata: {
        archived_in_hagen: 'true',
        archived_at: new Date().toISOString(),
        environment: getEnvironment(),
      },
    });
    cleanupSummary += cleanupSummary === 'No Stripe records found'
      ? `Archived customer ${customer.stripe_customer_id}`
      : `; archived customer ${customer.stripe_customer_id}`;
  }

  await logStripeAdminAction(supabaseAdmin, {
    eventType: 'customer.delete_cleanup',
    objectType: 'customer',
    objectId: customer.stripe_customer_id,
    status: 'success',
  });

  return cleanupSummary;
}
