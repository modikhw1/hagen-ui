import 'server-only';

import type Stripe from 'stripe';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { recurringUnitAmountFromMonthlySek } from '@/lib/stripe/price-amounts';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import type { AdminActionContext } from './types';

type SendInviteInput = Extract<CustomerAction, { action: 'send_invite' }>;

export type CreatedStripeArtifacts = {
  customerId: string | null;
  subscriptionId: string | null;
  productId: string | null;
  priceId: string | null;
  createdCustomer: boolean;
};

export async function persistPendingStripeAttachments(
  ctx: AdminActionContext,
  artifacts: CreatedStripeArtifacts,
  attemptNonce: number,
  reason: 'profile_update_failed' | 'invite_recovery',
  errorMessage: string,
) {
  await ctx.supabaseAdmin.from('pending_stripe_attachments').insert({
    customer_profile_id: ctx.id,
    stripe_customer_id: artifacts.customerId,
    stripe_subscription_id: artifacts.subscriptionId,
    stripe_product_id: artifacts.productId,
    stripe_price_id: artifacts.priceId,
    reason,
    metadata: {
      action: 'send_invite',
      invite_attempt_nonce: attemptNonce,
      error: errorMessage,
    },
  });
}

async function rollbackStripeArtifacts(
  stripeClient: Stripe,
  artifacts: CreatedStripeArtifacts,
) {
  if (artifacts.productId) {
    await stripeClient.products.del(artifacts.productId).catch(() => undefined);
  }

  if (artifacts.createdCustomer && artifacts.customerId) {
    await stripeClient.customers
      .del(artifacts.customerId)
      .catch(() => undefined);
  }
}

export async function createStripeArtifacts(
  ctx: AdminActionContext,
  input: SendInviteInput,
  attemptNonce: number,
): Promise<CreatedStripeArtifacts> {
  if (input.pricing_status === 'unknown' || Number(input.monthly_price) <= 0) {
    return {
      customerId: null,
      subscriptionId: null,
      productId: null,
      priceId: null,
      createdCustomer: false,
    };
  }

  if (!ctx.stripeClient) {
    throw new Error(SERVER_COPY.stripeNotConfigured);
  }

  const baseKey = `invite:${ctx.id}:${attemptNonce}`;
  const subscriptionInterval = input.subscription_interval || 'month';
  const stripeInterval: 'day' | 'week' | 'month' | 'year' =
    subscriptionInterval === 'quarter'
      ? 'month'
      : subscriptionInterval === 'year'
        ? 'year'
        : 'month';
  const intervalCount = subscriptionInterval === 'quarter' ? 3 : 1;
  const intervalText =
    subscriptionInterval === 'month'
      ? 'manadsvis'
      : subscriptionInterval === 'quarter'
        ? 'kvartalsvis'
        : 'årligen';

  const customer = await ctx.stripeClient.customers.create(
    {
      email: input.contact_email,
      name: input.business_name,
      preferred_locales: ['sv'],
      metadata: {
        customer_profile_id: ctx.id,
        pricing_status: input.pricing_status,
      },
    },
    { idempotencyKey: `${baseKey}:customer` },
  );

  const product = await ctx.stripeClient.products.create(
    {
      name: 'LeTrend Prenumeration',
      description: input.invoice_text || `${input.business_name} - ${intervalText}`,
      tax_code: 'txcd_10000000',
      metadata: {
        scope_items: JSON.stringify(input.scope_items || []),
        invoice_text: input.invoice_text || '',
        contract_start_date: input.contract_start_date || '',
        billing_day_of_month: String(input.billing_day_of_month || 25),
        first_invoice_behavior: input.first_invoice_behavior || 'prorated',
        upcoming_monthly_price: String(input.upcoming_monthly_price || ''),
        upcoming_price_effective_date: input.upcoming_price_effective_date || '',
      },
    },
    { idempotencyKey: `${baseKey}:product` },
  );

  const price = await ctx.stripeClient.prices.create(
    {
      unit_amount: recurringUnitAmountFromMonthlySek({
        monthlyPriceSek: input.monthly_price,
        interval: stripeInterval,
        intervalCount,
      }),
      currency: 'sek',
      recurring: {
        interval: stripeInterval,
        interval_count: intervalCount,
      },
      product: product.id,
    },
    { idempotencyKey: `${baseKey}:price` },
  );

  try {
    const subscription = await ctx.stripeClient.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: price.id }],
        collection_method: 'send_invoice',
        days_until_due: 14,
        metadata: {
          customer_profile_id: ctx.id,
          scope_items: JSON.stringify(input.scope_items || []),
          invoice_text: input.invoice_text || '',
          pricing_status: input.pricing_status,
          contract_start_date: input.contract_start_date || '',
          billing_day_of_month: String(input.billing_day_of_month || 25),
          first_invoice_behavior: input.first_invoice_behavior || 'prorated',
          upcoming_monthly_price: String(input.upcoming_monthly_price || ''),
          upcoming_price_effective_date: input.upcoming_price_effective_date || '',
        },
      },
      { idempotencyKey: `${baseKey}:subscription` },
    );

    return {
      customerId: customer.id,
      subscriptionId: subscription.id,
      productId: product.id,
      priceId: price.id,
      createdCustomer: true,
    };
  } catch (error) {
    await rollbackStripeArtifacts(ctx.stripeClient, {
      customerId: customer.id,
      subscriptionId: null,
      productId: product.id,
      priceId: price.id,
      createdCustomer: true,
    });
    throw error;
  }
}
