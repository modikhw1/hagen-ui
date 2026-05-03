import { logger } from './logger.js';

// Minimal subset of stripe's Subscription object we read from.
export type StripeSubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'paused';

interface StripeSubscriptionLike {
  id: string;
  status: StripeSubscriptionStatus | string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  pause_collection?: { behavior?: string } | null;
}

interface StripeClient {
  subscriptions: {
    retrieve: (id: string) => Promise<StripeSubscriptionLike>;
  };
  charges: {
    retrieve: (id: string, opts?: { expand?: string[] }) => Promise<unknown>;
  };
}

let cached: StripeClient | null | undefined;

export function getStripe(): StripeClient | null {
  if (cached !== undefined) return cached;
  const key =
    process.env['STRIPE_SECRET_KEY'] ??
    process.env['STRIPE_LIVE_SECRET_KEY'] ??
    process.env['STRIPE_TEST_SECRET_KEY'];
  if (!key) {
    cached = null;
    return null;
  }
  // Use require() to avoid pulling stripe types into the bundler graph.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Stripe = require('stripe');
  cached = new Stripe(key, { apiVersion: '2024-06-20', typescript: true }) as StripeClient;
  return cached;
}

// ── Short-lived TTL cache for subscription lookups ─────────────────────────
//
// /api/admin/customers/:id is hit on every avtal page load. Without a cache
// each open + reload would round-trip to Stripe (~150ms) and burn API quota.
// 60s is short enough that pause/resume + status changes show up quickly.
const SUBSCRIPTION_TTL_MS = 60_000;
const subscriptionCache = new Map<string, { fetchedAt: number; sub: StripeSubscriptionLike | null }>();

export interface FetchedSubscription {
  status: StripeSubscriptionStatus | string;
  cancel_at_period_end: boolean;
  current_period_end: number | null;
  paused_collection: boolean;
  cached: boolean;
}

export async function fetchSubscription(
  subscriptionId: string,
): Promise<FetchedSubscription | null> {
  if (!subscriptionId) return null;
  const now = Date.now();
  const cachedEntry = subscriptionCache.get(subscriptionId);
  if (cachedEntry && now - cachedEntry.fetchedAt < SUBSCRIPTION_TTL_MS) {
    return cachedEntry.sub ? toFetched(cachedEntry.sub, true) : null;
  }

  const stripe = getStripe();
  if (!stripe) return null;

  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    subscriptionCache.set(subscriptionId, { fetchedAt: now, sub });
    return toFetched(sub, false);
  } catch (err) {
    // Cache the miss for a shorter window so a deleted/invalid subscription
    // doesn't get re-fetched on every request, but is retried sooner than
    // a happy-path lookup.
    subscriptionCache.set(subscriptionId, { fetchedAt: now - SUBSCRIPTION_TTL_MS + 10_000, sub: null });
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), subscriptionId },
      'stripe subscriptions.retrieve failed; will fall back to local derivation',
    );
    return null;
  }
}

function toFetched(sub: StripeSubscriptionLike, fromCache: boolean): FetchedSubscription {
  return {
    status: sub.status,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    current_period_end: typeof sub.current_period_end === 'number' ? sub.current_period_end : null,
    paused_collection: Boolean(sub.pause_collection),
    cached: fromCache,
  };
}

export function invalidateSubscriptionCache(subscriptionId?: string) {
  if (subscriptionId) subscriptionCache.delete(subscriptionId);
  else subscriptionCache.clear();
}
