import 'server-only';

import { formatDateOnly } from '@/lib/admin/billing-periods';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import type { TablesUpdate } from '@/types/database';
import type {
  ExistingProfileSnapshot,
  PriceIntent,
  UpdateProfileStepResult,
  ValidatedProfilePatch,
} from './types';

export function validatePricingUpdate(params: {
  existingProfile: ExistingProfileSnapshot;
  sanitizedBody: TablesUpdate<'customer_profiles'>;
}): UpdateProfileStepResult<ValidatedProfilePatch> {
  const { existingProfile, sanitizedBody } = params;
  const nextPricingStatus =
    (sanitizedBody.pricing_status as 'fixed' | 'unknown' | undefined) ||
    (existingProfile.pricing_status === 'unknown' ? 'unknown' : 'fixed');
  const nextMonthlyPrice =
    Number(
      sanitizedBody.monthly_price !== undefined
        ? sanitizedBody.monthly_price
        : existingProfile.monthly_price,
    ) || 0;
  const currentMonthlyPrice = Number(existingProfile.monthly_price) || 0;
  const hasActiveStripeSubscription = Boolean(existingProfile.stripe_subscription_id);
  const monthlyPriceChanged =
    sanitizedBody.monthly_price !== undefined &&
    nextMonthlyPrice !== currentMonthlyPrice;
  const nextUpcomingPrice =
    Number(
      sanitizedBody.upcoming_monthly_price !== undefined
        ? sanitizedBody.upcoming_monthly_price
        : existingProfile.upcoming_monthly_price,
    ) || 0;
  const nextUpcomingEffectiveDate = (
    sanitizedBody.upcoming_price_effective_date !== undefined
      ? sanitizedBody.upcoming_price_effective_date
      : existingProfile.upcoming_price_effective_date
  ) as string | null | undefined;
  const today = formatDateOnly(new Date());
  const upcomingDueNow = Boolean(
    nextUpcomingPrice > 0 &&
      nextUpcomingEffectiveDate &&
      nextUpcomingEffectiveDate <= today,
  );

  if (hasActiveStripeSubscription && nextPricingStatus === 'unknown') {
    return {
      ok: false,
      error: SERVER_COPY.pricingUnknownActiveSub,
      statusCode: 400,
    };
  }

  let priceIntent: PriceIntent = { kind: 'unchanged' };
  if (hasActiveStripeSubscription && nextPricingStatus === 'fixed') {
    if (upcomingDueNow) {
      priceIntent = {
        kind: 'apply_now',
        price: nextUpcomingPrice,
        reason: 'scheduled_due',
      };
    } else if (monthlyPriceChanged && nextMonthlyPrice > 0) {
      priceIntent = {
        kind: 'apply_now',
        price: nextMonthlyPrice,
        reason: 'manual',
      };
    } else if (
      nextUpcomingPrice > 0 &&
      nextUpcomingEffectiveDate &&
      nextUpcomingEffectiveDate > today
    ) {
      priceIntent = {
        kind: 'schedule',
        price: nextUpcomingPrice,
        effectiveDate: nextUpcomingEffectiveDate,
      };
    }
  }

  return {
    ok: true,
    value: {
      sanitizedBody,
      hasActiveStripeSubscription,
      nextPricingStatus,
      priceIntent,
    },
  };
}
