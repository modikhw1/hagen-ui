import 'server-only';

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isMissingColumnError,
  isMissingRelationError,
} from '@/lib/admin/schema-guards';
import {
  monthlyAmountOreFromRecurringUnit,
} from '@/lib/stripe/price-amounts';

function isMissingSchemaError(message?: string | null) {
  return isMissingRelationError(message) || isMissingColumnError(message);
}

async function ignoreMissingSchema<T>(
  work: () => Promise<T>,
): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Error && isMissingSchemaError(error.message)) {
      return null;
    }

    throw error;
  }
}

type CustomerProfileUpdateResult = Record<string, unknown>;

function toInclusiveDiscountEndsAt(endDate?: string | null) {
  return endDate ? `${endDate}T23:59:59.999Z` : null;
}

export async function persistCustomerSubscriptionPriceChange(params: {
  supabaseAdmin: SupabaseClient;
  customerId: string;
  stripeSubscriptionId: string | null;
  stripeScheduleId?: string | null;
  stripePriceId?: string | null;
  monthlyPriceSek: number;
  mode: 'now' | 'next_period';
  effectiveDate: string;
  createdBy?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const previousProfileResult = await params.supabaseAdmin
    .from('customer_profiles')
    .select('monthly_price')
    .eq('id', params.customerId)
    .single();

  if (previousProfileResult.error) {
    throw new Error(previousProfileResult.error.message);
  }

  const updatePayload =
    params.mode === 'now'
      ? {
          monthly_price: params.monthlyPriceSek,
          pricing_status: 'fixed',
          upcoming_monthly_price: null,
          upcoming_price_effective_date: null,
        }
      : {
          upcoming_monthly_price: params.monthlyPriceSek,
          upcoming_price_effective_date: params.effectiveDate,
        };

  const updatedProfileResult = await params.supabaseAdmin
    .from('customer_profiles')
    .update(updatePayload)
    .eq('id', params.customerId)
    .select('*')
    .single();

  if (updatedProfileResult.error) {
    throw new Error(updatedProfileResult.error.message);
  }

  const previousPriceOre =
    Math.round(Number(previousProfileResult.data.monthly_price) || 0) * 100;
  const nextPriceOre = Math.round(params.monthlyPriceSek * 100);

  await ignoreMissingSchema(async () => {
    const { error } = await ((params.supabaseAdmin.from(
      'customer_subscription_history' as never,
    ) as never) as {
      insert: (value: Record<string, unknown>) => Promise<{
        error: { message?: string } | null;
      }>;
    }).insert({
      customer_id: params.customerId,
      stripe_subscription_id: params.stripeSubscriptionId,
      stripe_schedule_id: params.stripeScheduleId ?? null,
      stripe_price_id: params.stripePriceId ?? null,
      mode: params.mode,
      previous_price_ore: previousPriceOre,
      next_price_ore: nextPriceOre,
      effective_date: params.effectiveDate,
      metadata: params.metadata ?? {},
      created_by: params.createdBy ?? null,
    });

    if (error) {
      throw new Error(error.message);
    }
  });

  if (params.mode === 'now') {
    await clearCustomerUpcomingPriceChange({
      supabaseAdmin: params.supabaseAdmin,
      customerId: params.customerId,
    });
  } else {
    await upsertCustomerUpcomingPriceChange({
      supabaseAdmin: params.supabaseAdmin,
      customerId: params.customerId,
      stripeSubscriptionId: params.stripeSubscriptionId,
      stripeScheduleId: params.stripeScheduleId ?? null,
      priceOre: nextPriceOre,
      effectiveDate: params.effectiveDate,
      createdBy: params.createdBy ?? null,
    });
  }

  return updatedProfileResult.data as CustomerProfileUpdateResult;
}

export async function upsertCustomerUpcomingPriceChange(params: {
  supabaseAdmin: SupabaseClient;
  customerId: string;
  stripeSubscriptionId?: string | null;
  stripeScheduleId?: string | null;
  priceOre: number;
  effectiveDate: string;
  createdBy?: string | null;
}) {
  await ignoreMissingSchema(async () => {
    const { error } = await ((params.supabaseAdmin.from(
      'customer_upcoming_price_changes' as never,
    ) as never) as {
      upsert: (
        value: Record<string, unknown>,
        options: { onConflict: string },
      ) => Promise<{ error: { message?: string } | null }>;
    }).upsert(
      {
        customer_id: params.customerId,
        stripe_subscription_id: params.stripeSubscriptionId ?? null,
        stripe_schedule_id: params.stripeScheduleId ?? null,
        price_ore: params.priceOre,
        effective_date: params.effectiveDate,
        created_by: params.createdBy ?? null,
      },
      { onConflict: 'customer_id' },
    );

    if (error) {
      throw new Error(error.message);
    }
  });
}

export async function clearCustomerUpcomingPriceChange(params: {
  supabaseAdmin: SupabaseClient;
  customerId: string;
}) {
  await ignoreMissingSchema(async () => {
    const { error } = await ((params.supabaseAdmin.from(
      'customer_upcoming_price_changes' as never,
    ) as never) as {
      delete: () => {
        eq: (column: string, value: string) => Promise<{
          error: { message?: string } | null;
        }>;
      };
    }).delete().eq('customer_id', params.customerId);

    if (error) {
      throw new Error(error.message);
    }
  });
}

export async function persistCustomerDiscount(params: {
  supabaseAdmin: SupabaseClient;
  customerId: string;
  discountType: 'percent' | 'amount' | 'free_months';
  value: number;
  durationMonths: number | null;
  ongoing: boolean;
  startDate?: string | null;
  endDate?: string | null;
  stripeCouponId?: string | null;
  stripePromotionCodeId?: string | null;
  createdBy?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const normalizedValue =
    params.discountType === 'free_months'
      ? Math.max(1, params.durationMonths ?? params.value)
      : params.value;

  const updateResult = await params.supabaseAdmin
    .from('customer_profiles')
    .update({
      discount_type: params.discountType,
      discount_value: normalizedValue,
      discount_duration_months: params.ongoing ? null : params.durationMonths,
      discount_start_date: params.startDate ?? null,
      discount_end_date: params.endDate ?? null,
      discount_ends_at: toInclusiveDiscountEndsAt(params.endDate),
    })
    .eq('id', params.customerId)
    .select('*')
    .single();

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }

  await ignoreMissingSchema(async () => {
    const table = ((params.supabaseAdmin.from('customer_discounts' as never) as never) as {
      update: (value: Record<string, unknown>) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: boolean) => Promise<{
            error: { message?: string } | null;
          }>;
        };
      };
      insert: (value: Record<string, unknown>) => Promise<{
        error: { message?: string } | null;
      }>;
    });

    const deactivate = await table
      .update({ active: false })
      .eq('customer_id', params.customerId)
      .eq('active', true);

    if (deactivate.error) {
      throw new Error(deactivate.error.message);
    }

    const insert = await table.insert({
      customer_id: params.customerId,
      stripe_coupon_id: params.stripeCouponId ?? null,
      stripe_promotion_code_id: params.stripePromotionCodeId ?? null,
      discount_type: params.discountType,
      value: normalizedValue,
      duration_months: params.ongoing ? null : params.durationMonths,
      ongoing: params.ongoing,
      start_date: params.startDate ?? null,
      end_date: params.endDate ?? null,
      active: true,
      metadata: params.metadata ?? {},
      created_by: params.createdBy ?? null,
    });

    if (insert.error) {
      throw new Error(insert.error.message);
    }
  });

  return updateResult.data as CustomerProfileUpdateResult;
}

export async function clearCustomerDiscount(params: {
  supabaseAdmin: SupabaseClient;
  customerId: string;
}) {
  const updateResult = await params.supabaseAdmin
    .from('customer_profiles')
    .update({
      discount_type: 'none',
      discount_value: 0,
      discount_duration_months: null,
      discount_start_date: null,
      discount_end_date: null,
      discount_ends_at: null,
    } as never)
    .eq('id', params.customerId)
    .select('*')
    .single();

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }

  await ignoreMissingSchema(async () => {
    const { error } = await (((params.supabaseAdmin.from(
      'customer_discounts' as never,
    ) as never) as {
      update: (value: Record<string, unknown>) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: boolean) => Promise<{
            error: { message?: string } | null;
          }>;
        };
      };
    }).update({ active: false })).eq('customer_id', params.customerId).eq('active', true);

    if (error) {
      throw new Error(error.message);
    }
  });

  return updateResult.data as CustomerProfileUpdateResult;
}

export async function recordCustomerInviteToken(params: {
  supabaseAdmin: SupabaseClient;
  customerId: string;
  email: string;
  createdBy?: string | null;
  inviteLink?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await ignoreMissingSchema(async () => {
    const table = ((params.supabaseAdmin.from('customer_invites' as never) as never) as {
      update: (value: Record<string, unknown>) => {
        eq: (column: string, value: string) => {
          is: (column: string, value: null) => {
            is: (column: string, value: null) => Promise<{
              error: { message?: string } | null;
            }>;
          };
        };
      };
      insert: (value: Record<string, unknown>) => Promise<{
        error: { message?: string } | null;
      }>;
    });

    const supersede = await table
      .update({ superseded_at: new Date().toISOString() })
      .eq('customer_id', params.customerId)
      .is('consumed_at', null)
      .is('superseded_at', null);

    if (supersede.error) {
      throw new Error(supersede.error.message);
    }

    const insert = await table.insert({
      customer_id: params.customerId,
      email: params.email,
      invite_link: params.inviteLink ?? null,
      expires_at: params.expiresAt ?? null,
      metadata: params.metadata ?? {},
      created_by: params.createdBy ?? null,
    });

    if (insert.error) {
      throw new Error(insert.error.message);
    }
  });
}

export function extractNextSchedulePhase(
  schedule: Stripe.SubscriptionSchedule,
) {
  const now = Math.floor(Date.now() / 1000);
  return (
    schedule.phases.find((phase) => phase.start_date > now) ??
    schedule.phases.find((phase) => phase.end_date > now)
  );
}

export function subscriptionHasPromotedScheduledPrice(params: {
  currentMonthlyPriceOre: number;
  upcomingPriceSek: number | null | undefined;
}) {
  if (params.upcomingPriceSek == null) {
    return false;
  }

  return params.currentMonthlyPriceOre === Math.round(params.upcomingPriceSek * 100);
}

export function monthlyPriceOreFromSchedulePhaseItem(
  item:
    | Stripe.SubscriptionSchedule.Phase.Item
    | (Stripe.SubscriptionSchedule.Phase.Item & {
        price?: Stripe.Price | string | null;
      }),
  price?: Stripe.Price | null,
) {
  const sourcePrice =
    price ??
    (typeof item.price === 'object' && item.price && 'unit_amount' in item.price
      ? item.price
      : null);

  if (!sourcePrice?.recurring) {
    return null;
  }

  return monthlyAmountOreFromRecurringUnit({
    unitAmountOre: sourcePrice.unit_amount ?? 0,
    interval: sourcePrice.recurring.interval,
    intervalCount: sourcePrice.recurring.interval_count ?? 1,
  });
}
