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
import {
  upsertCreditNoteMirror,
  upsertRefundMirror,
} from './billing-adjustments';
import {
  monthlyAmountOreFromRecurringUnit,
  recurringUnitAmountFromMonthlySek,
} from './price-amounts';
import { applyPriceToSubscription } from './subscription-pricing';

type Ctx = {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  requestId?: string | null;
};

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

export type SubscriptionPriceChangeMode = 'now' | 'next_period';
export type SubscriptionCancellationMode =
  | 'end_of_period'
  | 'immediate'
  | 'immediate_with_credit';

export interface SubscriptionPricePreview {
  mode: SubscriptionPriceChangeMode;
  effective_date: string;
  current_price_ore: number;
  new_price_ore: number;
  line_items: Array<{
    id: string;
    description: string;
    amount_ore: number;
    currency: string;
    period_start: string | null;
    period_end: string | null;
  }>;
  invoice_total_ore: number;
}

export interface InvoiceCreditNoteInput {
  invoiceId: string;
  stripeLineItemId: string;
  amountOre: number;
  memo?: string | null;
  refundAmountOre?: number | null;
  reason?: Stripe.CreditNoteCreateParams.Reason | null;
}

export interface CancelSubscriptionInput {
  profileId: string;
  mode: SubscriptionCancellationMode;
  creditAmountOre?: number | null;
  invoiceId?: string | null;
  memo?: string | null;
  reason?: Stripe.CreditNoteCreateParams.Reason | null;
}

async function getProfileWithStripe(ctx: Ctx, profileId: string) {
  const { data, error } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .select(
      'id, business_name, contact_email, monthly_price, paused_until, stripe_customer_id, stripe_subscription_id'
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
    objectType: 'charge' | 'credit_note' | 'customer' | 'invoice' | 'invoice_item' | 'subscription';
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

async function getSubscriptionContext(args: Ctx & { profileId: string }) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_subscription_id) {
    throw new Error('Inget aktivt abonnemang');
  }

  const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id, {
    expand: ['items.data.price.product'],
  });
  const item = subscription.items.data[0];
  if (!item) {
    throw new Error('Subscription saknar prisrad');
  }

  const productId =
    typeof item.price.product === 'string'
      ? item.price.product
      : item.price.product?.id ?? null;

  if (!productId) {
    throw new Error('Subscription saknar produktkoppling');
  }

  return {
    stripe,
    profile,
    subscription,
    item,
    productId,
  };
}

function formatDateOnly(value?: number | null) {
  if (!value) return null;
  return new Date(value * 1000).toISOString().slice(0, 10);
}

function toPreviewLineItems(invoice: Stripe.UpcomingInvoice | Stripe.Invoice) {
  return (invoice.lines?.data ?? []).map((lineItem) => ({
    id: lineItem.id,
    description: lineItem.description || 'Stripe-rad',
    amount_ore: lineItem.amount || 0,
    currency: lineItem.currency || 'sek',
    period_start: lineItem.period?.start
      ? new Date(lineItem.period.start * 1000).toISOString()
      : null,
    period_end: lineItem.period?.end
      ? new Date(lineItem.period.end * 1000).toISOString()
      : null,
  }));
}

async function resolveInvoiceRecord(
  supabaseAdmin: SupabaseClient,
  invoiceId: string,
) {
  const result = await supabaseAdmin
    .from('invoices')
    .select('id, stripe_invoice_id, status, amount_due, amount_paid, stripe_customer_id')
    .eq('id', invoiceId)
    .maybeSingle();

  if (result.error || !result.data?.stripe_invoice_id) {
    throw new Error(result.error?.message || 'Fakturan kunde inte hittas');
  }

  return result.data;
}

async function resolveCancellationInvoice(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  invoiceId?: string | null,
) {
  if (invoiceId) {
    return resolveInvoiceRecord(supabaseAdmin, invoiceId);
  }

  const result = await supabaseAdmin
    .from('invoices')
    .select('id, stripe_invoice_id, status, amount_due, amount_paid, stripe_customer_id')
    .eq('customer_profile_id', profileId)
    .in('status', ['paid', 'open'])
    .order('created_at', { ascending: false })
    .limit(1);

  const invoice = result.data?.[0];
  if (!invoice?.stripe_invoice_id) {
    throw new Error('Ingen betald eller oppen faktura hittades for kreditering');
  }

  return invoice;
}

async function resolveChargeForInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice,
) {
  const invoiceWithCharge = invoice as Stripe.Invoice & {
    charge?: string | { id: string } | null;
  };
  const chargeId =
    typeof invoiceWithCharge.charge === 'string'
      ? invoiceWithCharge.charge
      : invoiceWithCharge.charge?.id ?? null;

  if (!chargeId) return null;

  return stripe.charges.retrieve(chargeId);
}

export async function previewSubscriptionPriceChange(
  args: Ctx & {
    profileId: string;
    monthlyPriceSek: number;
    mode: SubscriptionPriceChangeMode;
  }
): Promise<SubscriptionPricePreview> {
  const { stripe, profile, subscription, item, productId } = await getSubscriptionContext(args);
  const recurringInterval = item.price.recurring?.interval ?? 'month';
  const recurringIntervalCount = item.price.recurring?.interval_count ?? 1;
  const currentRecurringPriceOre = item.price.unit_amount ?? 0;
  const currentPriceOre = monthlyAmountOreFromRecurringUnit({
    unitAmountOre: currentRecurringPriceOre,
    interval: recurringInterval,
    intervalCount: recurringIntervalCount,
  });
  const nextPriceOre = Math.round(args.monthlyPriceSek * 100);
  const nextRecurringPriceOre = recurringUnitAmountFromMonthlySek({
    monthlyPriceSek: args.monthlyPriceSek,
    interval: recurringInterval,
    intervalCount: recurringIntervalCount,
  });
  const quantity = item.quantity ?? 1;
  const currentPeriodEnd = item.current_period_end ?? null;

  if (args.mode === 'next_period') {
    return {
      mode: args.mode,
      effective_date: formatDateOnly(currentPeriodEnd) ?? new Date().toISOString().slice(0, 10),
      current_price_ore: currentPriceOre,
      new_price_ore: nextPriceOre,
      line_items: [
        {
          id: item.id,
          description: `Nuvarande pris kvar till ${formatDateOnly(currentPeriodEnd) ?? 'periodslut'}`,
          amount_ore: currentRecurringPriceOre * quantity,
          currency: item.price.currency || 'sek',
          period_start: item.current_period_start
            ? new Date(item.current_period_start * 1000).toISOString()
            : null,
          period_end: currentPeriodEnd
            ? new Date(currentPeriodEnd * 1000).toISOString()
            : null,
        },
        {
          id: `${item.id}_scheduled`,
          description: 'Nytt pris fran nasta period',
          amount_ore: nextRecurringPriceOre * quantity,
          currency: item.price.currency || 'sek',
          period_start: currentPeriodEnd
            ? new Date(currentPeriodEnd * 1000).toISOString()
            : null,
          period_end: null,
        },
      ],
      invoice_total_ore: 0,
    };
  }

  if (!args.stripeClient) {
    throw new Error('Stripe not configured on server');
  }

  const prorationDate = Math.floor(Date.now() / 1000);
  const preview = await stripe.invoices.createPreview({
    customer:
      (typeof subscription.customer === 'string'
        ? subscription.customer
        : profile.stripe_customer_id) ?? undefined,
    subscription: subscription.id,
    subscription_details: {
      proration_behavior: 'always_invoice',
      proration_date: prorationDate,
      items: [
        {
          id: item.id,
          price_data: {
            currency: item.price.currency || DEFAULT_CURRENCY,
            product: productId,
            recurring: {
              interval: recurringInterval,
              interval_count: recurringIntervalCount,
            },
            unit_amount: nextRecurringPriceOre,
          },
          quantity,
        },
      ],
    },
  });

  return {
    mode: args.mode,
    effective_date: new Date(prorationDate * 1000).toISOString().slice(0, 10),
    current_price_ore: currentPriceOre,
    new_price_ore: nextPriceOre,
    line_items: toPreviewLineItems(preview),
    invoice_total_ore: preview.total ?? 0,
  };
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

  const invoiceRow = await resolveInvoiceRecord(args.supabaseAdmin, args.invoiceId);
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
  const invoiceRow = await resolveInvoiceRecord(args.supabaseAdmin, args.invoiceId);
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

export async function createInvoiceLineCreditNote(
  args: Ctx & InvoiceCreditNoteInput,
) {
  const stripe = ensureStripe(args);
  const invoiceRow = await resolveInvoiceRecord(args.supabaseAdmin, args.invoiceId);
  const lineItemResult = await args.supabaseAdmin
    .from('invoice_line_items')
    .select('stripe_line_item_id, amount')
    .eq('stripe_invoice_id', invoiceRow.stripe_invoice_id)
    .eq('stripe_line_item_id', args.stripeLineItemId)
    .maybeSingle();

  if (lineItemResult.error || !lineItemResult.data?.stripe_line_item_id) {
    throw new Error(lineItemResult.error?.message || 'Fakturaraden kunde inte hittas');
  }

  const lineAmount = Math.abs(Number(lineItemResult.data.amount) || 0);
  if (args.amountOre <= 0 || args.amountOre > lineAmount) {
    throw new Error('Kreditbeloppet maste vara mellan 1 och radens belopp');
  }

  const creditNote = await stripe.creditNotes.create({
    invoice: invoiceRow.stripe_invoice_id,
    memo: args.memo ?? undefined,
    reason: args.reason ?? 'order_change',
    lines: [
      {
        type: 'invoice_line_item',
        invoice_line_item: args.stripeLineItemId,
        amount: args.amountOre,
      },
    ],
    refund_amount:
      invoiceRow.status === 'paid' && (args.refundAmountOre ?? 0) > 0
        ? Math.min(args.refundAmountOre ?? 0, args.amountOre)
        : undefined,
  });

  await upsertCreditNoteMirror({
    supabaseAdmin: args.supabaseAdmin,
    creditNote,
    environment: stripeEnvironment,
  });

  const refreshedInvoice = await stripe.invoices.retrieve(invoiceRow.stripe_invoice_id, {
    expand: ['lines.data'],
  });
  await upsertInvoiceMirror({
    supabaseAdmin: args.supabaseAdmin,
    invoice: refreshedInvoice,
    environment: stripeEnvironment,
  });

  await logStripeAdminAction(args.supabaseAdmin, {
    eventType: 'admin.credit_note.created',
    objectType: 'credit_note',
    objectId: creditNote.id,
    status: 'success',
    summary: {
      invoice_id: invoiceRow.stripe_invoice_id,
      amount_ore: args.amountOre,
      refund_amount_ore: args.refundAmountOre ?? 0,
    },
  });

  return {
    creditNote,
    invoice: refreshedInvoice,
  };
}

export async function pauseCustomerSubscription(
  args: Ctx & { profileId: string; pauseUntil?: string | null }
) {
  const { stripe, profile } = await getSubscriptionContext(args);

  const sub = await stripe.subscriptions.update(profile.stripe_subscription_id!, {
    pause_collection: { behavior: 'mark_uncollectible' },
    metadata: {
      pause_until: args.pauseUntil ?? '',
    },
  }, args.requestId ? { idempotencyKey: `cust-${args.profileId}:pause:${args.requestId}` } : undefined);
  await upsertSubscriptionMirror({
    supabaseAdmin: args.supabaseAdmin,
    subscription: sub,
    environment: stripeEnvironment,
  });

  return sub;
}

export async function resumeCustomerSubscription(args: Ctx & { profileId: string }) {
  const { stripe, profile } = await getSubscriptionContext(args);

  const sub = await stripe.subscriptions.update(profile.stripe_subscription_id!, {
    pause_collection: null,
    cancel_at_period_end: false,
    metadata: {
      pause_until: '',
    },
  }, args.requestId ? { idempotencyKey: `cust-${args.profileId}:resume:${args.requestId}` } : undefined);
  await upsertSubscriptionMirror({
    supabaseAdmin: args.supabaseAdmin,
    subscription: sub,
    environment: stripeEnvironment,
  });
  return sub;
}

export async function cancelCustomerSubscription(args: Ctx & CancelSubscriptionInput) {
  const { stripe, profile } = await getSubscriptionContext(args);

  if (args.mode === 'end_of_period') {
    const sub = await stripe.subscriptions.update(profile.stripe_subscription_id!, {
      cancel_at_period_end: true,
    }, args.requestId ? { idempotencyKey: `cust-${args.profileId}:cancel-eop:${args.requestId}` } : undefined);
    await upsertSubscriptionMirror({
      supabaseAdmin: args.supabaseAdmin,
      subscription: sub,
      environment: stripeEnvironment,
    });
    return { subscription: sub, creditNote: null };
  }

  const canceledSubscription = await stripe.subscriptions.cancel(
    profile.stripe_subscription_id!,
    {
      prorate: false,
      invoice_now: false,
    },
    args.requestId ? { idempotencyKey: `cust-${args.profileId}:cancel-now:${args.requestId}` } : undefined,
  );

  await upsertSubscriptionMirror({
    supabaseAdmin: args.supabaseAdmin,
    subscription: canceledSubscription,
    environment: stripeEnvironment,
  });

  if (args.mode !== 'immediate_with_credit') {
    return { subscription: canceledSubscription, creditNote: null };
  }

  const targetInvoice = await resolveCancellationInvoice(
    args.supabaseAdmin,
    profile.id,
    args.invoiceId,
  );
  const creditAmountOre = Math.max(
    0,
    Math.min(
      Number(args.creditAmountOre) || 0,
      targetInvoice.status === 'paid'
        ? Number(targetInvoice.amount_paid) || 0
        : Number(targetInvoice.amount_due) || 0,
    ),
  );

  if (creditAmountOre <= 0) {
    throw new Error('Ange ett kreditbelopp som ar storre an 0');
  }

  const creditNote = await stripe.creditNotes.create({
    invoice: targetInvoice.stripe_invoice_id,
    amount: creditAmountOre,
    memo: args.memo ?? undefined,
    reason: args.reason ?? 'order_change',
    refund_amount: targetInvoice.status === 'paid' ? creditAmountOre : undefined,
  });

  await upsertCreditNoteMirror({
    supabaseAdmin: args.supabaseAdmin,
    creditNote,
    environment: stripeEnvironment,
  });

  const refreshedInvoice = await stripe.invoices.retrieve(targetInvoice.stripe_invoice_id, {
    expand: ['lines.data'],
  });
  await upsertInvoiceMirror({
    supabaseAdmin: args.supabaseAdmin,
    invoice: refreshedInvoice,
    environment: stripeEnvironment,
  });

  if (targetInvoice.status === 'paid') {
    const charge = await resolveChargeForInvoice(stripe, refreshedInvoice);
    if (charge?.refunds?.data?.length) {
      for (const refund of charge.refunds.data) {
        await upsertRefundMirror({
          supabaseAdmin: args.supabaseAdmin,
          refund,
          charge,
          environment: stripeEnvironment,
        });
      }
    }
  }

  await logStripeAdminAction(args.supabaseAdmin, {
    eventType: 'admin.subscription.cancelled_with_credit',
    objectType: 'subscription',
    objectId: canceledSubscription.id,
    status: 'success',
    summary: {
      mode: args.mode,
      credit_note_id: creditNote.id,
      credit_amount_ore: creditAmountOre,
    },
  });

  return {
    subscription: canceledSubscription,
    creditNote,
  };
}

export async function applySubscriptionPriceChange(
  args: Ctx & {
    profileId: string;
    monthlyPriceSek: number;
    mode: SubscriptionPriceChangeMode;
  }
) {
  const { profile, item } = await getSubscriptionContext(args);

  if (args.mode === 'next_period') {
    return {
      mode: args.mode,
      subscription: null,
      effectiveDate: formatDateOnly(item.current_period_end) ?? new Date().toISOString().slice(0, 10),
      appliedPriceOre: Math.round(args.monthlyPriceSek * 100),
    };
  }

  const subscription = await applyPriceToSubscription({
    stripeClient: ensureStripe(args),
    subscriptionId: profile.stripe_subscription_id!,
    monthlyPriceSek: args.monthlyPriceSek,
    source: 'admin_manual',
    supabaseAdmin: args.supabaseAdmin,
    prorationBehavior: 'always_invoice',
    prorationDate: Math.floor(Date.now() / 1000),
    requestId: args.requestId ?? null,
  });

  return {
    mode: args.mode,
    subscription,
    effectiveDate: new Date().toISOString().slice(0, 10),
    appliedPriceOre: Math.round(args.monthlyPriceSek * 100),
  };
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
