import type { Tables, TablesUpdate } from '@/types/database';

export type ExistingProfileSnapshot = Pick<
  Tables<'customer_profiles'>,
  | 'id'
  | 'monthly_price'
  | 'pricing_status'
  | 'stripe_subscription_id'
  | 'stripe_customer_id'
  | 'upcoming_monthly_price'
  | 'upcoming_price_effective_date'
>;

export type UpdateProfileStepResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; statusCode: number; details?: unknown };

export type PriceIntent =
  | { kind: 'unchanged' }
  | { kind: 'apply_now'; price: number; reason: 'manual' | 'scheduled_due' }
  | { kind: 'schedule'; price: number; effectiveDate: string };

export type NormalizedProfilePatch = {
  sanitizedBody: TablesUpdate<'customer_profiles'>;
};

export type ValidatedProfilePatch = {
  sanitizedBody: TablesUpdate<'customer_profiles'>;
  hasActiveStripeSubscription: boolean;
  nextPricingStatus: 'fixed' | 'unknown';
  priceIntent: PriceIntent;
};
