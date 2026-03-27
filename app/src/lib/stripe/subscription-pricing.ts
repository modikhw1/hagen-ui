import Stripe from 'stripe';
import { type SupabaseClient } from '@supabase/supabase-js';

type PriceSyncSource = 'admin_manual' | 'scheduled_upcoming';

interface ApplySubscriptionPriceOptions {
  stripeClient: Stripe;
  subscriptionId: string;
  monthlyPriceSek: number;
  source: PriceSyncSource;
  supabaseAdmin?: SupabaseClient;
}

const toIso = (unixSeconds?: number | null) =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;

const toInterval = (
  recurring?: Stripe.Price.Recurring | null
): { interval: 'day' | 'week' | 'month' | 'year'; interval_count: number } => {
  if (!recurring?.interval) {
    return { interval: 'month', interval_count: 1 };
  }

  return {
    interval: recurring.interval,
    interval_count: recurring.interval_count || 1,
  };
};

export async function applyPriceToSubscription({
  stripeClient,
  subscriptionId,
  monthlyPriceSek,
  source,
  supabaseAdmin,
}: ApplySubscriptionPriceOptions): Promise<Stripe.Subscription> {
  const normalizedPriceOre = Math.round(Number(monthlyPriceSek) * 100);
  if (normalizedPriceOre <= 0) {
    throw new Error('Invalid monthly price for subscription update');
  }

  const subscription = await stripeClient.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  });

  const item = subscription.items.data[0];
  if (!item?.id || !item.price) {
    throw new Error('Subscription has no updatable item');
  }

  const productId =
    typeof item.price.product === 'string'
      ? item.price.product
      : item.price.product?.id;
  if (!productId) {
    throw new Error('Subscription item is missing product');
  }

  const recurring = toInterval(item.price.recurring);
  const currency = item.price.currency || subscription.currency || 'sek';

  const existingPrices = await stripeClient.prices.list({
    product: productId,
    active: true,
    currency,
    type: 'recurring',
    limit: 100,
  });

  const reusablePrice = existingPrices.data.find((price) => {
    const recurringPrice = price.recurring;
    return (
      price.unit_amount === normalizedPriceOre &&
      recurringPrice?.interval === recurring.interval &&
      Number(recurringPrice?.interval_count || 1) === recurring.interval_count &&
      price.tax_behavior === 'exclusive'
    );
  });

  const nextPrice = reusablePrice || await stripeClient.prices.create({
    unit_amount: normalizedPriceOre,
    currency,
    tax_behavior: 'exclusive',
    recurring,
    product: productId,
  });

  const updatedSubscription = await stripeClient.subscriptions.update(subscriptionId, {
    items: [
      {
        id: item.id,
        price: nextPrice.id,
      },
    ],
    proration_behavior: 'none',
    metadata: {
      ...subscription.metadata,
      last_price_sync_source: source,
      last_price_sync_at: new Date().toISOString(),
      last_price_value_sek: String(monthlyPriceSek),
    },
  });

  if (supabaseAdmin) {
    const syncedItem = updatedSubscription.items.data[0];
    const syncedRecurring = syncedItem?.price?.recurring;
    const upsertPayload = {
      stripe_subscription_id: updatedSubscription.id,
      stripe_customer_id: String(updatedSubscription.customer || ''),
      status: String(updatedSubscription.status || 'incomplete'),
      cancel_at_period_end: Boolean(updatedSubscription.cancel_at_period_end),
      currency: String(updatedSubscription.currency || syncedItem?.price?.currency || 'sek'),
      amount: Number(syncedItem?.price?.unit_amount || 0),
      interval: syncedRecurring?.interval || null,
      interval_count: Number(syncedRecurring?.interval_count || 1),
      current_period_start: toIso(syncedItem?.current_period_start || null),
      current_period_end: toIso(syncedItem?.current_period_end || null),
      trial_start: toIso(updatedSubscription.trial_start || null),
      trial_end: toIso(updatedSubscription.trial_end || null),
      canceled_at: toIso(updatedSubscription.canceled_at || null),
      cancel_at: toIso(updatedSubscription.cancel_at || null),
      ended_at: toIso(updatedSubscription.ended_at || null),
    };

    const { error } = await supabaseAdmin
      .from('subscriptions')
      .upsert(upsertPayload, { onConflict: 'stripe_subscription_id' });
    if (error) {
      throw new Error(`Failed to sync subscriptions table: ${error.message}`);
    }
  }

  return updatedSubscription;
}
