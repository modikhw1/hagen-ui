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
  clearCustomerDiscount,
  persistCustomerDiscount,
} from '@/lib/admin/customer-billing-store';
import {
  deriveBillingDiscountDurationMonths,
  hasBillingDiscountSpecificPeriod,
} from '@/lib/schemas/billing';
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
  startDate?: string | null;
  endDate?: string | null;
  idempotencyToken?: string | null;
}

export interface PendingInvoiceItemInput {
  description: string;
  unitAmountSek: number;
  quantity?: number;
  currency?: string;
  metadata?: Record<string, string>;
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
  subscription_id: string;
  current_period_end: string | null;
  proration_behavior: 'create_prorations' | 'none';
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

export interface SubscriptionCancellationPreview {
  mode: SubscriptionCancellationMode;
  subscription_id: string;
  current_period_start: string | null;
  current_period_end: string | null;
  effective_date: string;
  days_remaining: number;
  unused_amount_ore: number;
  currency: string;
  /**
   * Föreslagen kreditering till kunden för perioden som inte används.
   * Negativt belopp i Stripe-konvention (kreditnota), men exponerat som
   * positivt här för enkelhet i UI.
   */
  proposed_credit_ore: number;
}

export interface InvoiceCreditNoteInput {
  invoiceId: string;
  stripeLineItemId: string | null;
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
  creditSettlementMode?: 'refund' | 'customer_balance' | 'outside_stripe' | null;
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

async function getPersistedUpcomingScheduleId(
  supabaseAdmin: SupabaseClient,
  profileId: string,
) {
  const result = await (((supabaseAdmin.from(
    'customer_upcoming_price_changes' as never,
  ) as never) as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { stripe_schedule_id?: string | null } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  }).select('stripe_schedule_id')).eq('customer_id', profileId).maybeSingle();

  if (result.error) {
    const message = result.error.message?.toLowerCase() ?? '';
    if (message.includes('relation') && message.includes('does not exist')) {
      return null;
    }

    throw new Error(result.error.message || 'Kunde inte läsa kommande prisändring');
  }

  return result.data?.stripe_schedule_id ?? null;
}

async function releasePersistedScheduleIfPresent(args: Ctx & { profileId: string }) {
  const stripe = ensureStripe(args);
  const scheduleId = await getPersistedUpcomingScheduleId(args.supabaseAdmin, args.profileId);
  if (!scheduleId) {
    return null;
  }

  try {
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    if (schedule.status === 'active' || schedule.status === 'not_started') {
      await stripe.subscriptionSchedules.release(scheduleId, {
        preserve_cancel_date: true,
      });
    }
  } catch (error) {
    console.warn('[billing] failed to release persisted subscription schedule', error);
  }

  return scheduleId;
}

async function createRecurringPriceForSubscription(params: {
  stripe: Stripe;
  productId: string;
  currency: string;
  interval: Stripe.Price.Recurring.Interval;
  intervalCount: number;
  monthlyPriceSek: number;
  requestId?: string | null;
  subscriptionId: string;
}) {
  return params.stripe.prices.create(
    {
      unit_amount: recurringUnitAmountFromMonthlySek({
        monthlyPriceSek: params.monthlyPriceSek,
        interval: params.interval,
        intervalCount: params.intervalCount,
      }),
      currency: params.currency,
      recurring: {
        interval: params.interval,
        interval_count: params.intervalCount,
      },
      product: params.productId,
    },
    params.requestId
      ? { idempotencyKey: `sub-${params.subscriptionId}:schedule-price:${params.requestId}` }
      : undefined,
  );
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
    .or(
      `id.eq.${
        invoiceId.length === 36
          ? invoiceId
          : '00000000-0000-0000-0000-000000000000'
      },stripe_invoice_id.eq.${invoiceId}`,
    )
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
      subscription_id: subscription.id,
      current_period_end: formatDateOnly(currentPeriodEnd),
      proration_behavior: 'none',
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
      proration_behavior: 'create_prorations',
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
    subscription_id: subscription.id,
    current_period_end: formatDateOnly(currentPeriodEnd),
    proration_behavior: 'create_prorations',
    current_price_ore: currentPriceOre,
    new_price_ore: nextPriceOre,
    line_items: toPreviewLineItems(preview),
    invoice_total_ore: preview.total ?? 0,
  };
}

/**
 * Förhandsgranskar effekten av att avsluta ett abonnemang. Räknar fram
 * oanvända dagar i nuvarande period och föreslår en prorata-kredit.
 * Gör inga ändringar i Stripe.
 */
export async function previewSubscriptionCancellation(
  args: Ctx & {
    profileId: string;
    mode: SubscriptionCancellationMode;
  },
): Promise<SubscriptionCancellationPreview> {
  const { subscription, item } = await getSubscriptionContext(args);

  const currentPeriodStart = item.current_period_start ?? null;
  const currentPeriodEnd = item.current_period_end ?? null;
  const unitAmountOre = item.price.unit_amount ?? 0;
  const quantity = item.quantity ?? 1;
  const periodAmountOre = unitAmountOre * quantity;
  const currency = item.price.currency || DEFAULT_CURRENCY;

  const nowSec = Math.floor(Date.now() / 1000);

  // Vid end_of_period sker inget nu; krediten är 0
  if (args.mode === 'end_of_period') {
    return {
      mode: args.mode,
      subscription_id: subscription.id,
      current_period_start: currentPeriodStart
        ? new Date(currentPeriodStart * 1000).toISOString()
        : null,
      current_period_end: currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000).toISOString()
        : null,
      effective_date: currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      days_remaining: currentPeriodEnd
        ? Math.max(0, Math.ceil((currentPeriodEnd - nowSec) / 86400))
        : 0,
      unused_amount_ore: 0,
      currency,
      proposed_credit_ore: 0,
    };
  }

  // immediate / immediate_with_credit: räkna prorata
  let unusedOre = 0;
  let daysRemaining = 0;
  if (currentPeriodStart && currentPeriodEnd && currentPeriodEnd > nowSec) {
    const totalSec = Math.max(currentPeriodEnd - currentPeriodStart, 1);
    const remainingSec = currentPeriodEnd - nowSec;
    daysRemaining = Math.ceil(remainingSec / 86400);
    unusedOre = Math.round((periodAmountOre * remainingSec) / totalSec);
  }

  return {
    mode: args.mode,
    subscription_id: subscription.id,
    current_period_start: currentPeriodStart
      ? new Date(currentPeriodStart * 1000).toISOString()
      : null,
    current_period_end: currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : null,
    effective_date: new Date(nowSec * 1000).toISOString().slice(0, 10),
    days_remaining: daysRemaining,
    unused_amount_ore: unusedOre,
    currency,
    proposed_credit_ore: args.mode === 'immediate_with_credit' ? unusedOre : 0,
  } satisfies SubscriptionCancellationPreview;
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
  const appliedAt = new Date().toISOString();
  const usesSpecificPeriod =
    args.input.type !== 'free_months' &&
    hasBillingDiscountSpecificPeriod({
      ongoing: args.input.ongoing,
      startDate: args.input.startDate ?? null,
      endDate: args.input.endDate ?? null,
    });
  const durationMonths =
    args.input.type === 'free_months'
      ? Math.max(1, args.input.durationMonths ?? args.input.value)
      : args.input.ongoing
        ? null
        : deriveBillingDiscountDurationMonths({
            type: args.input.type,
            value: args.input.value,
            ongoing: false,
            duration_months: args.input.durationMonths,
            start_date: args.input.startDate ?? null,
            end_date: args.input.endDate ?? null,
            idempotency_token: args.input.idempotencyToken ?? undefined,
          });
  const persistedDurationMonths =
    args.input.type === 'free_months'
      ? durationMonths
      : usesSpecificPeriod
        ? null
        : durationMonths;
  const discountIdempotencyKey = args.input.idempotencyToken
    ? `discount:${args.profileId}:${args.input.idempotencyToken}`
    : `discount:${args.profileId}:${args.input.type}:${args.input.value}:${durationMonths ?? 'none'}:${args.input.ongoing ? 'ongoing' : 'limited'}:${args.input.startDate ?? 'none'}:${args.input.endDate ?? 'none'}`;

  let coupon: Stripe.Coupon;
  if (args.input.type === 'percent') {
    coupon = await stripe.coupons.create(
      {
        percent_off: args.input.value,
        duration: args.input.ongoing || usesSpecificPeriod
          ? 'forever'
          : durationMonths
            ? 'repeating'
            : 'once',
        duration_in_months: !args.input.ongoing && !usesSpecificPeriod
          ? durationMonths ?? 1
          : undefined,
      },
      {
        idempotencyKey: `${discountIdempotencyKey}:coupon`,
      },
    );
  } else if (args.input.type === 'amount') {
    coupon = await stripe.coupons.create(
      {
        amount_off: Math.round(args.input.value * 100),
        currency: DEFAULT_CURRENCY,
        duration: args.input.ongoing || usesSpecificPeriod
          ? 'forever'
          : durationMonths
            ? 'repeating'
            : 'once',
        duration_in_months: !args.input.ongoing && !usesSpecificPeriod
          ? durationMonths ?? 1
          : undefined,
      },
      {
        idempotencyKey: `${discountIdempotencyKey}:coupon`,
      },
    );
  } else {
    coupon = await stripe.coupons.create(
      {
        percent_off: 100,
        duration: 'repeating',
        duration_in_months: Math.max(1, durationMonths ?? args.input.value),
      },
      {
        idempotencyKey: `${discountIdempotencyKey}:coupon`,
      },
    );
  }

  const promotionCode = await stripe.promotionCodes.create(
    {
      promotion: {
        type: 'coupon',
        coupon: coupon.id,
      },
      active: true,
      metadata: {
        customer_profile_id: args.profileId,
        discount_type: args.input.type,
        created_at: appliedAt,
      },
    },
    {
      idempotencyKey: `${discountIdempotencyKey}:promotion-code`,
    },
  );

  if (profile.stripe_subscription_id) {
    await stripe.subscriptions.update(
      profile.stripe_subscription_id,
      {
        discounts: [{ promotion_code: promotionCode.id }],
      },
      {
        idempotencyKey: `${discountIdempotencyKey}:subscription`,
      },
    );
  } else {
    await stripe.customers.update(
      profile.stripe_customer_id,
      {
        coupon: coupon.id,
      } as never,
      {
        idempotencyKey: `${discountIdempotencyKey}:customer`,
      },
    );
  }
  const data = await persistCustomerDiscount({
    supabaseAdmin: args.supabaseAdmin,
    customerId: profile.id,
    discountType: args.input.type,
    value: args.input.value,
    durationMonths: persistedDurationMonths,
    ongoing: args.input.ongoing,
    startDate: args.input.startDate ?? null,
    endDate: args.input.endDate ?? null,
    stripeCouponId: coupon.id,
    stripePromotionCodeId: promotionCode.id,
    metadata: {
      applied_at: appliedAt,
      idempotency_token: args.input.idempotencyToken ?? null,
    },
  });

  await logStripeAdminAction(args.supabaseAdmin, {
    eventType: 'admin.discount.applied',
    objectType: 'customer',
    objectId: profile.stripe_customer_id,
    status: 'success',
    summary: {
      coupon: coupon.id,
      promotion_code_id: promotionCode.id,
      idempotency_token: args.input.idempotencyToken ?? null,
      ...args.input,
    },
  });

  return { profile: data, couponId: coupon.id, promotionCodeId: promotionCode.id };
}

export async function removeCustomerDiscount(args: Ctx & { profileId: string }) {
  const profile = await getProfileWithStripe(args, args.profileId);

  if (profile.stripe_subscription_id) {
    const stripe = ensureStripe(args);
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      discounts: [],
    });
  } else if (profile.stripe_customer_id) {
    const stripe = ensureStripe(args);
    await stripe.customers.deleteDiscount(profile.stripe_customer_id);
  }

  const data = await clearCustomerDiscount({
    supabaseAdmin: args.supabaseAdmin,
    customerId: profile.id,
  });

  if (profile.stripe_subscription_id || profile.stripe_customer_id) {
    await logStripeAdminAction(args.supabaseAdmin, {
      eventType: 'admin.discount.removed',
      objectType: 'customer',
      objectId: profile.stripe_customer_id,
      status: 'success',
    });
  }

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

  return items.data.map((item) => {
    const quantity = Math.max(1, item.quantity || 1);
    const unitAmountOre = item.pricing?.unit_amount_decimal
      ? Math.round(Number(item.pricing.unit_amount_decimal))
      : Math.round((item.amount || 0) / quantity);

    return {
      id: item.id,
      description: item.description ?? '',
      amount_ore: item.amount,
      amount_sek: item.amount / 100,
      unit_amount_ore: unitAmountOre,
      unit_amount_sek: unitAmountOre / 100,
      quantity,
      currency: item.currency,
      created: item.date ? new Date(item.date * 1000).toISOString() : null,
      metadata: item.metadata,
    };
  });
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
    quantity: Math.max(1, Math.round(args.input.quantity ?? 1)),
    currency: (args.input.currency || DEFAULT_CURRENCY).toLowerCase(),
    description: args.input.description,
    unit_amount_decimal: String(Math.round(args.input.unitAmountSek * 100)),
    metadata: args.input.metadata,
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
    unit_amount_ore: item.pricing?.unit_amount_decimal
      ? Math.round(Number(item.pricing.unit_amount_decimal))
      : Math.round((item.amount || 0) / Math.max(1, item.quantity || 1)),
    unit_amount_sek: item.pricing?.unit_amount_decimal
      ? Number(item.pricing.unit_amount_decimal) / 100
      : (item.amount || 0) / Math.max(1, item.quantity || 1) / 100,
    quantity: Math.max(1, item.quantity || 1),
    currency: item.currency,
    created: item.date ? new Date(item.date * 1000).toISOString() : null,
    metadata: item.metadata,
  };
}

export async function updatePendingInvoiceItem(
  args: Ctx & {
    itemId: string;
    input: PendingInvoiceItemInput;
  }
) {
  const stripe = ensureStripe(args);
  const item = await stripe.invoiceItems.update(args.itemId, {
    description: args.input.description,
    quantity: Math.max(1, Math.round(args.input.quantity ?? 1)),
    unit_amount_decimal: String(Math.round(args.input.unitAmountSek * 100)),
    metadata: args.input.metadata,
  });

  await logStripeAdminAction(args.supabaseAdmin, {
    eventType: 'admin.invoice_item.updated',
    objectType: 'invoice_item',
    objectId: item.id,
    status: 'success',
  });

  return {
    id: item.id,
    description: item.description ?? '',
    amount_ore: item.amount,
    amount_sek: item.amount / 100,
    unit_amount_ore: item.pricing?.unit_amount_decimal
      ? Math.round(Number(item.pricing.unit_amount_decimal))
      : Math.round((item.amount || 0) / Math.max(1, item.quantity || 1)),
    unit_amount_sek: item.pricing?.unit_amount_decimal
      ? Number(item.pricing.unit_amount_decimal) / 100
      : (item.amount || 0) / Math.max(1, item.quantity || 1) / 100,
    quantity: Math.max(1, item.quantity || 1),
    currency: item.currency,
    created: item.date ? new Date(item.date * 1000).toISOString() : null,
    metadata: item.metadata,
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

  const invoice = await stripe.invoices.create({
    customer: profile.stripe_customer_id,
    collection_method: 'send_invoice',
    days_until_due: args.daysUntilDue ?? DEFAULT_DAYS_UNTIL_DUE,
    pending_invoice_items_behavior: 'exclude',
    metadata: {
      customer_profile_id: profile.id,
      source: 'admin_manual_invoice',
    },
  });

  for (const item of args.items) {
    await stripe.invoiceItems.create({
      customer: profile.stripe_customer_id,
      invoice: invoice.id,
      amount: Math.round(item.amountSek * 100),
      currency: DEFAULT_CURRENCY,
      description: item.description,
    });
  }

  const finalInvoice = args.autoFinalize
    ? await stripe.invoices.finalizeInvoice(invoice.id)
    : await stripe.invoices.retrieve(invoice.id, { expand: ['lines.data'] });

  const persistedInvoice = args.autoFinalize
    ? await stripe.invoices.sendInvoice(finalInvoice.id)
    : finalInvoice;

  await upsertInvoiceMirror({
    supabaseAdmin: args.supabaseAdmin,
    invoice: persistedInvoice,
    environment: stripeEnvironment,
  });

  await logStripeAdminAction(args.supabaseAdmin, {
    eventType: 'admin.invoice.created',
    objectType: 'invoice',
    objectId: persistedInvoice.id,
    status: 'success',
  });

  return persistedInvoice;
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

  const creditNoteParams: Stripe.CreditNoteCreateParams = {
    invoice: invoiceRow.stripe_invoice_id,
    memo: args.memo ?? undefined,
    reason: args.reason ?? 'order_change',
    refund_amount:
      invoiceRow.status === 'paid' && (args.refundAmountOre ?? 0) > 0
        ? Math.min(args.refundAmountOre ?? 0, args.amountOre)
        : undefined,
  };

  if (args.stripeLineItemId) {
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

    creditNoteParams.lines = [
      {
        type: 'invoice_line_item',
        invoice_line_item: args.stripeLineItemId,
        amount: args.amountOre,
      },
    ];
  } else {
    // Full invoice credit
    creditNoteParams.amount = args.amountOre;
  }

  const creditNote = await stripe.creditNotes.create(creditNoteParams);

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

  let targetInvoice: Awaited<ReturnType<typeof resolveCancellationInvoice>> | null =
    null;
  let creditAmountOre = 0;
  let settlementMode: 'refund' | 'customer_balance' | 'outside_stripe' | null =
    null;
  let liveInvoice: Stripe.Invoice | null = null;
  let charge: Stripe.Charge | null = null;

  if (args.mode === 'immediate_with_credit') {
    targetInvoice = await resolveCancellationInvoice(
      args.supabaseAdmin,
      profile.id,
      args.invoiceId,
    );
    liveInvoice = await stripe.invoices.retrieve(targetInvoice.stripe_invoice_id, {
      expand: ['lines.data', 'charge'],
    });
    const effectiveInvoiceStatus = liveInvoice.status ?? targetInvoice.status;
    const maxCreditOre =
      effectiveInvoiceStatus === 'paid'
        ? Number(liveInvoice.amount_paid) || 0
        : Number(liveInvoice.amount_due) || 0;

    creditAmountOre = Math.max(
      0,
      Math.min(Number(args.creditAmountOre) || 0, maxCreditOre),
    );

    if (creditAmountOre <= 0) {
      throw new Error('Ange ett kreditbelopp som ar storre an 0');
    }

    settlementMode = args.creditSettlementMode ?? 'refund';
    charge = await resolveChargeForInvoice(stripe, liveInvoice);
    const canRefundPaymentMethod = Boolean(charge?.id);

    if (effectiveInvoiceStatus === 'paid' && settlementMode === 'refund' && !canRefundPaymentMethod) {
      throw new Error('Den betalade fakturan saknar refunderbar Stripe-charge');
    }
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

  if (args.mode !== 'immediate_with_credit' || !targetInvoice || !settlementMode || !liveInvoice) {
    return { subscription: canceledSubscription, creditNote: null };
  }

  const effectiveInvoiceStatus = liveInvoice.status ?? targetInvoice.status;

  const creditNoteParams: Stripe.CreditNoteCreateParams = {
    invoice: targetInvoice.stripe_invoice_id,
    amount: creditAmountOre,
    memo: args.memo ?? undefined,
    reason: args.reason ?? 'order_change',
  };

  if (effectiveInvoiceStatus === 'paid') {
    if (settlementMode === 'refund') {
      creditNoteParams.refund_amount = creditAmountOre;
    } else if (settlementMode === 'customer_balance') {
      creditNoteParams.credit_amount = creditAmountOre;
    } else {
      creditNoteParams.out_of_band_amount = creditAmountOre;
    }
  }

  const creditNote = await stripe.creditNotes.create(creditNoteParams);

  await upsertCreditNoteMirror({
    supabaseAdmin: args.supabaseAdmin,
    creditNote,
    environment: stripeEnvironment,
  });

  const refreshedInvoice = await stripe.invoices.retrieve(
    targetInvoice.stripe_invoice_id,
    {
      expand: ['lines.data', 'charge'],
    },
  );
  await upsertInvoiceMirror({
    supabaseAdmin: args.supabaseAdmin,
    invoice: refreshedInvoice,
    environment: stripeEnvironment,
  });

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

  await logStripeAdminAction(args.supabaseAdmin, {
    eventType: 'admin.subscription.cancelled_with_credit',
    objectType: 'subscription',
    objectId: canceledSubscription.id,
    status: 'success',
    summary: {
      mode: args.mode,
      credit_note_id: creditNote.id,
      credit_amount_ore: creditAmountOre,
      credit_settlement_mode: settlementMode,
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
  const { stripe, profile, subscription, item, productId } = await getSubscriptionContext(args);
  const recurringInterval = item.price.recurring?.interval ?? 'month';
  const recurringIntervalCount = item.price.recurring?.interval_count ?? 1;
  const currency = item.price.currency || DEFAULT_CURRENCY;
  const quantity = item.quantity ?? 1;

  if (args.mode === 'next_period') {
    const currentPeriodStart = item.current_period_start ?? null;
    const currentPeriodEnd = item.current_period_end ?? null;
    if (!currentPeriodEnd) {
      throw new Error('Subscription saknar periodslut for schemalaggning');
    }

    const newPrice = await createRecurringPriceForSubscription({
      stripe,
      productId,
      currency,
      interval: recurringInterval,
      intervalCount: recurringIntervalCount,
      monthlyPriceSek: args.monthlyPriceSek,
      requestId: args.requestId ?? null,
      subscriptionId: subscription.id,
    });

    let scheduleId = await getPersistedUpcomingScheduleId(args.supabaseAdmin, args.profileId);
    let schedule: Stripe.SubscriptionSchedule | null = null;

    if (scheduleId) {
      try {
        schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
        if (
          schedule.status === 'released' ||
          schedule.status === 'completed' ||
          schedule.status === 'canceled'
        ) {
          schedule = null;
          scheduleId = null;
        }
      } catch {
        schedule = null;
        scheduleId = null;
      }
    }

    if (!schedule) {
      schedule = await stripe.subscriptionSchedules.create(
        {
          from_subscription: subscription.id,
          end_behavior: 'release',
        },
        args.requestId
          ? { idempotencyKey: `sub-${subscription.id}:schedule-create:${args.requestId}` }
          : undefined,
      );
      scheduleId = schedule.id;
    }

    schedule = await stripe.subscriptionSchedules.update(
      scheduleId!,
      {
        end_behavior: 'release',
        proration_behavior: 'none',
        metadata: {
          customer_profile_id: args.profileId,
          next_price_ore: String(Math.round(args.monthlyPriceSek * 100)),
          effective_date:
            formatDateOnly(currentPeriodEnd) ?? new Date().toISOString().slice(0, 10),
        },
        phases: [
          {
            start_date: currentPeriodStart ?? schedule.current_phase?.start_date ?? undefined,
            end_date: currentPeriodEnd,
            items: [
              {
                price: item.price.id,
                quantity,
              },
            ],
          },
          {
            start_date: currentPeriodEnd,
            items: [
              {
                price: newPrice.id,
                quantity,
              },
            ],
            proration_behavior: 'none',
          },
        ],
      },
      args.requestId
        ? { idempotencyKey: `sub-${subscription.id}:schedule-update:${args.requestId}` }
        : undefined,
    );

    await logStripeAdminAction(args.supabaseAdmin, {
      eventType: 'admin.subscription.price_scheduled',
      objectType: 'subscription',
      objectId: subscription.id,
      status: 'success',
      summary: {
        schedule_id: schedule.id,
        stripe_price_id: newPrice.id,
        effective_date: formatDateOnly(currentPeriodEnd),
      },
    });

    return {
      mode: args.mode,
      subscription,
      stripeScheduleId: schedule.id,
      stripePriceId: newPrice.id,
      effectiveDate:
        formatDateOnly(currentPeriodEnd) ?? new Date().toISOString().slice(0, 10),
      appliedPriceOre: Math.round(args.monthlyPriceSek * 100),
    };
  }

  await releasePersistedScheduleIfPresent({
    ...args,
  });

  const updatedSubscription = await applyPriceToSubscription({
    stripeClient: ensureStripe(args),
    subscriptionId: profile.stripe_subscription_id!,
    monthlyPriceSek: args.monthlyPriceSek,
    source: 'admin_manual',
    supabaseAdmin: args.supabaseAdmin,
    prorationBehavior: 'create_prorations',
    prorationDate: Math.floor(Date.now() / 1000),
    requestId: args.requestId ?? null,
  });

  return {
    mode: args.mode,
    subscription: updatedSubscription,
    stripeScheduleId: null,
    stripePriceId: updatedSubscription.items.data[0]?.price?.id ?? null,
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
