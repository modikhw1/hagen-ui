import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  DEFAULT_CURRENCY,
  DEFAULT_DAYS_UNTIL_DUE,
} from './config';
import { stripeEnvironment } from './dynamic-config';
import {
  upsertInvoiceMirror,
  upsertSubscriptionMirror,
} from './mirror';
import { logStripeSync } from './sync-log';

type Ctx = { supabaseAdmin: SupabaseClient; stripeClient: Stripe | null };

export interface BillingDiscountInput {
  type: 'percent' | 'amount' | 'free_months';
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

async function getProfileWithStripe(ctx: Ctx, profileId: string) {
  const { data, error } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .select(
      'id, business_name, contact_email, monthly_price, stripe_customer_id, stripe_subscription_id'
    )
    .eq('id', profileId)
    .single();

  if (error || !data) throw new Error('Customer not found');
  return data;
}

function ensureStripe(ctx: Ctx): Stripe {
  if (!ctx.stripeClient) throw new Error('Stripe not configured on server');
  return ctx.stripeClient;
}

async function logStripeAdminAction(
  supabaseAdmin: SupabaseClient,
  payload: {
    eventType: string;
    objectType: 'customer' | 'subscription' | 'invoice' | 'invoice_item';
    objectId: string | null;
    status: 'success' | 'failed';
    errorMessage?: string | null;
    summary?: Record<string, unknown>;
  }
) {
  await logStripeSync({
    supabaseAdmin,
    eventId: `${payload.eventType}_${payload.objectId || 'n-a'}_${Date.now()}`,
    eventType: payload.eventType,
    objectType: payload.objectType,
    objectId: payload.objectId,
    syncDirection: 'supabase_to_stripe',
    status: payload.status,
    errorMessage: payload.errorMessage ?? null,
    payloadSummary: payload.summary ?? null,
    environment: stripeEnvironment,
  });
}

export async function applyCustomerDiscount(
  args: Ctx & {
    profileId: string;
    input: BillingDiscountInput;
  }
) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_customer_id) throw new Error('Kunden saknar Stripe customer');

  let coupon: Stripe.Coupon;
  if (args.input.type === 'percent') {
    coupon = await stripe.coupons.create({
      percent_off: args.input.value,
      duration: args.input.ongoing
        ? 'forever'
        : args.input.durationMonths
          ? 'repeating'
          : 'once',
      duration_in_months: !args.input.ongoing
        ? args.input.durationMonths ?? 1
        : undefined,
    });
  } else if (args.input.type === 'amount') {
    coupon = await stripe.coupons.create({
      amount_off: Math.round(args.input.value * 100),
      currency: DEFAULT_CURRENCY,
      duration: args.input.ongoing
        ? 'forever'
        : args.input.durationMonths
          ? 'repeating'
          : 'once',
      duration_in_months: !args.input.ongoing
        ? args.input.durationMonths ?? 1
        : undefined,
    });
  } else {
    coupon = await stripe.coupons.create({
      percent_off: 100,
      duration: 'repeating',
      duration_in_months: Math.max(1, args.input.durationMonths ?? args.input.value),
    });
  }

  if (profile.stripe_subscription_id) {
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      discounts: [{ coupon: coupon.id }],
    });
  } else {
    await stripe.customers.update(profile.stripe_customer_id, {
      coupon: coupon.id,
    } as never);
  }

  const update = {
    discount_type: args.input.type,
    discount_value:
      args.input.type === 'free_months'
        ? Math.max(1, args.input.durationMonths ?? args.input.value)
        : args.input.value,
    discount_duration_months: args.input.ongoing ? null : args.input.durationMonths,
  };

  const { data, error } = await args.supabaseAdmin
    .from('customer_profiles')
    .update(update)
    .eq('id', profile.id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  await logStripeAdminAction(args.supabaseAdmin, {
    eventType: 'admin.discount.applied',
    objectType: 'customer',
    objectId: profile.stripe_customer_id,
    status: 'success',
    summary: { coupon: coupon.id, ...args.input },
  });

  return { profile: data, couponId: coupon.id };
}

export async function removeCustomerDiscount(args: Ctx & { profileId: string }) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_customer_id) throw new Error('Kunden saknar Stripe customer');

  if (profile.stripe_subscription_id) {
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      discounts: [],
    });
  } else {
    await stripe.customers.deleteDiscount(profile.stripe_customer_id);
  }

  const { data, error } = await args.supabaseAdmin
    .from('customer_profiles')
    .update({
      discount_type: 'none',
      discount_value: 0,
      discount_duration_months: null,
      discount_start_date: null,
      discount_end_date: null,
      discount_ends_at: null,
    } as never)
    .eq('id', profile.id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  await logStripeAdminAction(args.supabaseAdmin, {
    eventType: 'admin.discount.removed',
    objectType: 'customer',
    objectId: profile.stripe_customer_id,
    status: 'success',
  });

  return { profile: data };
}

export async function listPendingInvoiceItems(args: Ctx & { profileId: string }) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_customer_id) return [];

  const items = await stripe.invoiceItems.list({
    customer: profile.stripe_customer_id,
    pending: true,
    limit: 50,
  });

  return items.data.map((item) => ({
    id: item.id,
    description: item.description ?? '',
    amount_ore: item.amount,
    amount_sek: item.amount / 100,
    currency: item.currency,
    created: item.date ? new Date(item.date * 1000).toISOString() : null,
  }));
}

export async function createPendingInvoiceItem(
  args: Ctx & {
    profileId: string;
    input: PendingInvoiceItemInput;
  }
) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_customer_id) throw new Error('Kunden saknar Stripe customer');

  const item = await stripe.invoiceItems.create({
    customer: profile.stripe_customer_id,
    amount: Math.round(args.input.amountSek * 100),
    currency: (args.input.currency || DEFAULT_CURRENCY).toLowerCase(),
    description: args.input.description,
  });

  await logStripeAdminAction(args.supabaseAdmin, {
    eventType: 'admin.invoice_item.created',
    objectType: 'invoice_item',
    objectId: item.id,
    status: 'success',
  });

  return {
    id: item.id,
    description: item.description ?? '',
    amount_ore: item.amount,
    amount_sek: item.amount / 100,
    currency: item.currency,
    created: item.date ? new Date(item.date * 1000).toISOString() : null,
  };
}

export async function deletePendingInvoiceItem(args: Ctx & { itemId: string }) {
  const stripe = ensureStripe(args);
  await stripe.invoiceItems.del(args.itemId);

  await logStripeAdminAction(args.supabaseAdmin, {
    eventType: 'admin.invoice_item.deleted',
    objectType: 'invoice_item',
    objectId: args.itemId,
    status: 'success',
  });

  return { ok: true };
}

export async function createManualInvoice(
  args: Ctx & {
    profileId: string;
    items: ManualInvoiceItemInput[];
    daysUntilDue: number;
    autoFinalize: boolean;
  }
) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_customer_id) throw new Error('Kunden saknar Stripe customer');

  for (const item of args.items) {
    await stripe.invoiceItems.create({
      customer: profile.stripe_customer_id,
      amount: Math.round(item.amountSek * 100),
      currency: DEFAULT_CURRENCY,
      description: item.description,
    });
  }

  const invoice = await stripe.invoices.create({
    customer: profile.stripe_customer_id,
    collection_method: 'send_invoice',
    days_until_due: args.daysUntilDue ?? DEFAULT_DAYS_UNTIL_DUE,
    pending_invoice_items_behavior: 'include',
    metadata: {
      customer_profile_id: profile.id,
      source: 'admin_manual_invoice',
    },
  });

  const finalInvoice = args.autoFinalize
    ? await stripe.invoices.finalizeInvoice(invoice.id)
    : invoice;

  if (args.autoFinalize) {
    await stripe.invoices.sendInvoice(finalInvoice.id);
  }

  await upsertInvoiceMirror({
    supabaseAdmin: args.supabaseAdmin,
    invoice: finalInvoice,
    environment: stripeEnvironment,
  });

  await logStripeAdminAction(args.supabaseAdmin, {
    eventType: 'admin.invoice.created',
    objectType: 'invoice',
    objectId: finalInvoice.id,
    status: 'success',
  });

  return finalInvoice;
}

export async function payInvoice(
  args: Ctx & {
    invoiceId: string;
  }
) {
  const stripe = ensureStripe(args);

  const { data: invoiceRow, error } = await args.supabaseAdmin
    .from('invoices')
    .select('id, stripe_invoice_id')
    .eq('id', args.invoiceId)
    .single();

  if (error || !invoiceRow?.stripe_invoice_id) {
    throw new Error('Fakturan kunde inte hittas');
  }

  const paidInvoice = await stripe.invoices.pay(invoiceRow.stripe_invoice_id, {
    paid_out_of_band: true,
  });

  await upsertInvoiceMirror({
    supabaseAdmin: args.supabaseAdmin,
    invoice: paidInvoice,
    environment: stripeEnvironment,
  });

  await logStripeAdminAction(args.supabaseAdmin, {
    eventType: 'admin.invoice.paid',
    objectType: 'invoice',
    objectId: paidInvoice.id,
    status: 'success',
  });

  return paidInvoice;
}

export async function voidInvoice(
  args: Ctx & {
    invoiceId: string;
  }
) {
  const stripe = ensureStripe(args);

  const { data: invoiceRow, error } = await args.supabaseAdmin
    .from('invoices')
    .select('id, stripe_invoice_id')
    .eq('id', args.invoiceId)
    .single();

  if (error || !invoiceRow?.stripe_invoice_id) {
    throw new Error('Fakturan kunde inte hittas');
  }

  const voidedInvoice = await stripe.invoices.voidInvoice(invoiceRow.stripe_invoice_id);

  await upsertInvoiceMirror({
    supabaseAdmin: args.supabaseAdmin,
    invoice: voidedInvoice,
    environment: stripeEnvironment,
  });

  await logStripeAdminAction(args.supabaseAdmin, {
    eventType: 'admin.invoice.voided',
    objectType: 'invoice',
    objectId: voidedInvoice.id,
    status: 'success',
  });

  return voidedInvoice;
}

export async function pauseCustomerSubscription(args: Ctx & { profileId: string }) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_subscription_id) throw new Error('Inget aktivt abonnemang');

  const sub = await stripe.subscriptions.update(profile.stripe_subscription_id, {
    pause_collection: { behavior: 'mark_uncollectible' },
  });
  await upsertSubscriptionMirror({
    supabaseAdmin: args.supabaseAdmin,
    subscription: sub,
    environment: stripeEnvironment,
  });
  return sub;
}

export async function resumeCustomerSubscription(args: Ctx & { profileId: string }) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_subscription_id) throw new Error('Inget aktivt abonnemang');

  const sub = await stripe.subscriptions.update(profile.stripe_subscription_id, {
    pause_collection: null,
    cancel_at_period_end: false,
  });
  await upsertSubscriptionMirror({
    supabaseAdmin: args.supabaseAdmin,
    subscription: sub,
    environment: stripeEnvironment,
  });
  return sub;
}

export async function cancelCustomerSubscription(args: Ctx & { profileId: string }) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_subscription_id) throw new Error('Inget aktivt abonnemang');

  const sub = await stripe.subscriptions.update(profile.stripe_subscription_id, {
    cancel_at_period_end: true,
  });
  await upsertSubscriptionMirror({
    supabaseAdmin: args.supabaseAdmin,
    subscription: sub,
    environment: stripeEnvironment,
  });
  return sub;
}

export async function archiveStripeCustomer(args: Ctx & { profileId: string }) {
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!args.stripeClient || !profile.stripe_customer_id) {
    return { skipped: true };
  }

  try {
    if (profile.stripe_subscription_id) {
      await args.stripeClient.subscriptions.cancel(profile.stripe_subscription_id);
    }
  } catch (error) {
    console.warn('cancel sub failed', error);
  }

  return { archived: true };
}
