import 'server-only';

import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { applyPriceToSubscription } from '@/lib/stripe/subscription-pricing';
import type { Tables, TablesUpdate } from '@/types/database';
import type { AdminActionContext } from '../types';
import type {
  ExistingProfileSnapshot,
  PriceIntent,
  UpdateProfileStepResult,
} from './types';

export async function syncStripePricing(params: {
  ctx: AdminActionContext;
  existingProfile: ExistingProfileSnapshot;
  sanitizedBody: TablesUpdate<'customer_profiles'>;
  priceIntent: PriceIntent;
}): Promise<UpdateProfileStepResult<TablesUpdate<'customer_profiles'>>> {
  const { ctx, existingProfile, sanitizedBody, priceIntent } = params;
  if (priceIntent.kind !== 'apply_now') {
    return { ok: true, value: sanitizedBody };
  }

  if (!ctx.stripeClient) {
    return {
      ok: false,
      error: SERVER_COPY.stripeNotConfigured,
      statusCode: 503,
    };
  }

  await applyPriceToSubscription({
    stripeClient: ctx.stripeClient,
    subscriptionId: String(existingProfile.stripe_subscription_id),
    monthlyPriceSek: priceIntent.price,
    source: priceIntent.reason === 'scheduled_due' ? 'scheduled_upcoming' : 'admin_manual',
    supabaseAdmin: ctx.supabaseAdmin,
    requestId: ctx.requestId,
  });

  if (priceIntent.reason === 'scheduled_due') {
    return {
      ok: true,
      value: {
        ...sanitizedBody,
        monthly_price: priceIntent.price,
        pricing_status: 'fixed',
        upcoming_monthly_price: null,
        upcoming_price_effective_date: null,
      } satisfies TablesUpdate<'customer_profiles'>,
    };
  }

  return { ok: true, value: sanitizedBody };
}

export async function syncStripeContactInfo(params: {
  ctx: AdminActionContext;
  profile: Tables<'customer_profiles'>;
  updatePayload: TablesUpdate<'customer_profiles'>;
}) {
  const { ctx, profile, updatePayload } = params;
  const nextContactEmail =
    typeof updatePayload.contact_email === 'string'
      ? updatePayload.contact_email.trim()
      : null;
  const previousContactEmail =
    typeof ctx.beforeProfile?.contact_email === 'string'
      ? ctx.beforeProfile.contact_email.trim()
      : null;
  if (
    !ctx.stripeClient ||
    !nextContactEmail ||
    nextContactEmail === previousContactEmail ||
    typeof profile.stripe_customer_id !== 'string' ||
    !profile.stripe_customer_id
  ) {
    return;
  }

  await ctx.stripeClient.customers.update(profile.stripe_customer_id, {
    email: nextContactEmail,
    name:
      typeof profile.business_name === 'string' && profile.business_name
        ? profile.business_name
        : undefined,
  });
}
