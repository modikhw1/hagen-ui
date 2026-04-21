import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { DEFAULT_CURRENCY } from './config';
import { stripeEnvironment } from './dynamic-config';
import { upsertSubscriptionMirror } from './mirror';
import { recurringUnitAmountFromMonthlySek } from './price-amounts';
import { logStripeSync } from './sync-log';

export async function applyPriceToSubscription(args: {
  stripeClient: Stripe;
  subscriptionId: string;
  monthlyPriceSek: number;
  source: 'admin_manual' | 'scheduled_upcoming';
  supabaseAdmin: SupabaseClient;
  prorationBehavior?: 'always_invoice' | 'create_prorations' | 'none';
  prorationDate?: number;
}) {
  const subscription = await args.stripeClient.subscriptions.retrieve(
    args.subscriptionId,
    { expand: ['items.data.price.product'] }
  );
  const item = subscription.items.data[0];
  if (!item) throw new Error('Subscription saknar items');

  const productId =
    typeof item.price.product === 'string'
      ? item.price.product
      : item.price.product.id;
  const interval = item.price.recurring?.interval ?? 'month';
  const intervalCount = item.price.recurring?.interval_count ?? 1;

  const newPrice = await args.stripeClient.prices.create({
    unit_amount: recurringUnitAmountFromMonthlySek({
      monthlyPriceSek: args.monthlyPriceSek,
      interval,
      intervalCount,
    }),
    currency: DEFAULT_CURRENCY,
    recurring: { interval, interval_count: intervalCount },
    product: productId,
  });

  const updated = await args.stripeClient.subscriptions.update(subscription.id, {
    items: [{ id: item.id, price: newPrice.id }],
    proration_behavior: args.prorationBehavior ?? 'create_prorations',
    proration_date: args.prorationDate,
    metadata: {
      ...subscription.metadata,
      price_source: args.source,
      price_changed_at: new Date().toISOString(),
    },
  });

  await upsertSubscriptionMirror({
    supabaseAdmin: args.supabaseAdmin,
    subscription: updated,
    environment: stripeEnvironment,
  });
  await logStripeSync({
    supabaseAdmin: args.supabaseAdmin,
    eventId: `price_change_${subscription.id}_${Date.now()}`,
    eventType: 'admin.price.applied',
    objectType: 'subscription',
    objectId: subscription.id,
    syncDirection: 'supabase_to_stripe',
    status: 'success',
    environment: stripeEnvironment,
    payloadSummary: { newPrice: newPrice.id, source: args.source },
  });

  return updated;
}
