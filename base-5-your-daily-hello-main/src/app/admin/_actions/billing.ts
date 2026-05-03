'use server';

import 'server-only';

import { revalidateTag } from 'next/cache';
import { recordAuditLog } from '@/lib/admin/audit-log';
import {
  ADMIN_CUSTOMERS_LIST_TAG,
  revalidateAdminCustomerViews,
} from '@/lib/admin/cache-tags';
import { handleChangeSubscriptionPrice } from '@/lib/admin/customer-actions/change-subscription-price';
import { handleResendInvite } from '@/lib/admin/customer-actions/resend-invite';
import { loadCustomerDetail } from '@/lib/admin/customer-detail/load';
import type { CustomerDetail } from '@/lib/admin/dtos/customer';
import { createAdminCustomer } from '@/lib/admin/customers/create.server';
import { createCustomerServerSchema } from '@/lib/schemas/customer';
import {
  billingDiscountLineItemSchema,
  billingDiscountSchema,
  deriveBillingDiscountDurationMonths,
  subscriptionPriceChangeSchema,
  type BillingDiscountInput,
  type BillingDiscountLineItemInput,
} from '@/lib/schemas/billing';
import {
  applyCustomerDiscount,
  applyDiscountAsLineItem,
  previewSubscriptionPriceChange,
  removeCustomerDiscount,
} from '@/lib/stripe/admin-billing';
import { stripe } from '@/lib/stripe/dynamic-config';
import {
  actionData,
  actionError,
  getAdminActionSession,
  runAdminCustomerAction,
  type AdminActionResult,
} from './shared';

export async function previewSubscriptionPrice(input: {
  customerId: string;
  monthlyPriceSek: number;
  mode: 'now' | 'next_period';
}) {
  const parsed = subscriptionPriceChangeSchema.safeParse({
    monthly_price: input.monthlyPriceSek,
    mode: input.mode,
  });

  if (!parsed.success) {
    return actionError('BAD_REQUEST', parsed.error.issues[0]?.message || 'Ogiltig payload');
  }

  return runAdminCustomerAction({
    id: input.customerId,
    scope: 'super_admin',
    revalidate: false,
    work: async (ctx) =>
      previewSubscriptionPriceChange({
        supabaseAdmin: ctx.supabaseAdmin,
        stripeClient: ctx.stripeClient,
        profileId: ctx.id,
        monthlyPriceSek: parsed.data.monthly_price,
        mode: parsed.data.mode,
      }),
  });
}

export async function changeSubscriptionPrice(input: {
  customerId: string;
  monthlyPriceSek: number;
  mode: 'now' | 'next_period';
}) {
  const parsed = subscriptionPriceChangeSchema.safeParse({
    monthly_price: input.monthlyPriceSek,
    mode: input.mode,
  });

  if (!parsed.success) {
    return actionError('BAD_REQUEST', parsed.error.issues[0]?.message || 'Ogiltig payload');
  }

  return runAdminCustomerAction({
    id: input.customerId,
    scope: 'super_admin',
    work: (ctx) =>
      handleChangeSubscriptionPrice(ctx, {
        action: 'change_subscription_price',
        monthly_price: parsed.data.monthly_price,
        mode: parsed.data.mode,
      }),
  });
}

export async function resendInvite(input: { customerId: string }) {
  return runAdminCustomerAction({
    id: input.customerId,
    scope: 'customers.invite',
    work: (ctx) =>
      handleResendInvite(ctx, {
        action: 'resend_invite',
      }),
  });
}

export async function inviteCustomer(input: unknown): Promise<
  AdminActionResult<{
    customerId: string;
    inviteSent: boolean;
    profileUrl: string;
    warnings: string[];
  }>
> {
  const parsed = createCustomerServerSchema.safeParse(input);
  if (!parsed.success) {
    return actionError('BAD_REQUEST', parsed.error.issues[0]?.message || 'Ogiltig payload');
  }

  try {
    const { user, supabaseAdmin } = await getAdminActionSession('customers.write');
    if (parsed.data.send_invite_now) {
      await getAdminActionSession('customers.invite');
    }

    const result = await createAdminCustomer({
      supabaseAdmin,
      user,
      body: parsed.data,
    });

    if (!result.ok) {
      return actionError(
        result.status === 400 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
        result.error,
      );
    }

    revalidateTag(ADMIN_CUSTOMERS_LIST_TAG, 'max');
    revalidateAdminCustomerViews(result.payload.customer.id);

    return actionData({
      customerId: result.payload.customer.id,
      inviteSent: result.payload.invite_sent,
      profileUrl: result.payload.profile_url,
      warnings: result.payload.warnings,
    });
  } catch (error) {
    return actionError(
      'INTERNAL_SERVER_ERROR',
      error instanceof Error ? error.message : 'Internt serverfel',
    );
  }
}

export async function applyDiscount(input: {
  customerId: string;
  payload: BillingDiscountInput;
}) {
  const parsed = billingDiscountSchema.safeParse(input.payload);
  if (!parsed.success) {
    return actionError('BAD_REQUEST', parsed.error.issues[0]?.message || 'Ogiltig payload');
  }

  try {
    const { user, supabaseAdmin } = await getAdminActionSession('super_admin');
    const durationMonths = deriveBillingDiscountDurationMonths(parsed.data);
    const result = await applyCustomerDiscount({
      supabaseAdmin,
      stripeClient: stripe,
      profileId: input.customerId,
      input: {
        type: parsed.data.type,
        value:
          parsed.data.type === 'free_months'
            ? parsed.data.duration_months
            : parsed.data.value,
        durationMonths,
        ongoing: parsed.data.type === 'free_months' ? false : parsed.data.ongoing,
        startDate: parsed.data.start_date ?? null,
        endDate: parsed.data.end_date ?? null,
        idempotencyToken: parsed.data.idempotency_token,
      },
    });

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.customer.discount_applied',
      entityType: 'customer_profile',
      entityId: input.customerId,
      metadata: {
        type: parsed.data.type,
        value:
          parsed.data.type === 'free_months'
            ? parsed.data.duration_months
            : parsed.data.value,
        duration_months: durationMonths,
        ongoing: parsed.data.type === 'free_months' ? false : parsed.data.ongoing,
        start_date: parsed.data.start_date ?? null,
        end_date: parsed.data.end_date ?? null,
        idempotency_token: parsed.data.idempotency_token ?? null,
        coupon_id: result.couponId,
        promotion_code_id: result.promotionCodeId ?? null,
      },
    });

    revalidateAdminCustomerViews(input.customerId);

    const detail = await loadCustomerDetail({
      supabaseAdmin,
      id: input.customerId,
      user,
    });

    return actionData({
      customer: detail.customer as CustomerDetail,
      couponId: result.couponId,
      promotionCodeId: result.promotionCodeId ?? null,
    });
  } catch (error) {
    return actionError(
      'INTERNAL_SERVER_ERROR',
      error instanceof Error ? error.message : 'Kunde inte spara rabatt',
    );
  }
}

export async function removeDiscount(input: { customerId: string }) {
  try {
    const { user, supabaseAdmin } = await getAdminActionSession('super_admin');
    await removeCustomerDiscount({
      supabaseAdmin,
      stripeClient: stripe,
      profileId: input.customerId,
    });

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.customer.discount_removed',
      entityType: 'customer_profile',
      entityId: input.customerId,
    });

    revalidateAdminCustomerViews(input.customerId);

    const detail = await loadCustomerDetail({
      supabaseAdmin,
      id: input.customerId,
      user,
    });

    return actionData({
      customer: detail.customer as CustomerDetail,
    });
  } catch (error) {
    return actionError(
      'INTERNAL_SERVER_ERROR',
      error instanceof Error ? error.message : 'Kunde inte ta bort rabatt',
    );
  }
}

/**
 * Lägger en rabatt som negativa pending invoice items på kommande fakturor
 * (line-item-modellen). Föredragen för engångs- och tidsbegränsade rabatter.
 */
export async function applyDiscountLineItem(input: {
  customerId: string;
  payload: BillingDiscountLineItemInput;
}) {
  const parsed = billingDiscountLineItemSchema.safeParse(input.payload);
  if (!parsed.success) {
    return actionError('BAD_REQUEST', parsed.error.issues[0]?.message || 'Ogiltig payload');
  }

  try {
    const { user, supabaseAdmin } = await getAdminActionSession('super_admin');

    const result = await applyDiscountAsLineItem({
      supabaseAdmin,
      stripeClient: stripe,
      profileId: input.customerId,
      input: {
        type: parsed.data.type,
        value: parsed.data.type === 'free_months' ? undefined : parsed.data.value,
        months: parsed.data.months,
        description: parsed.data.description,
        idempotencyToken: parsed.data.idempotency_token ?? null,
      },
    });

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.customer.discount_line_item_applied',
      entityType: 'customer_profile',
      entityId: input.customerId,
      metadata: {
        type: parsed.data.type,
        value: parsed.data.type === 'free_months' ? null : parsed.data.value,
        months: parsed.data.months,
        per_month_ore: result.perMonthOre,
        total_ore: result.totalOre,
        invoice_item_ids: result.items.map((it) => it.id),
        idempotency_token: parsed.data.idempotency_token ?? null,
      },
    });

    revalidateAdminCustomerViews(input.customerId);

    const detail = await loadCustomerDetail({
      supabaseAdmin,
      id: input.customerId,
      user,
    });

    return actionData({
      customer: detail.customer as CustomerDetail,
      perMonthOre: result.perMonthOre,
      months: result.months,
      totalOre: result.totalOre,
      invoiceItemIds: result.items.map((it) => it.id),
    });
  } catch (error) {
    return actionError(
      'INTERNAL_SERVER_ERROR',
      error instanceof Error ? error.message : 'Kunde inte lägga till rabatt',
    );
  }
}

