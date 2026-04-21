import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { syncCustomerAssignmentFromProfile } from '@/lib/admin/cm-assignments';
import { buildCustomerPayload } from '@/lib/admin/customer-detail/load';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import { customerPatchSchema } from '@/lib/schemas/customer';
import { applyPriceToSubscription } from '@/lib/stripe/subscription-pricing';
import { resolveAccountManagerAssignment } from '@/lib/studio/account-manager';
import { jsonError } from '@/lib/server/api-response';
import type { TablesUpdate } from '@/types/database';
import { buildValidationErrorResponse, toOperationalProfileInput } from './shared';
import type { ActionResult, AdminActionContext } from './types';

export async function updateCustomerProfile(
  ctx: AdminActionContext,
  body: unknown,
): Promise<ActionResult> {
  const { data: existingProfile, error: existingProfileError } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .select(
      'id, monthly_price, pricing_status, stripe_subscription_id, upcoming_monthly_price, upcoming_price_effective_date',
    )
    .eq('id', ctx.id)
    .single();

  if (existingProfileError || !existingProfile) {
    return jsonError(existingProfileError?.message || 'Kunden hittades inte', 404);
  }

  const parsedPatch = customerPatchSchema.safeParse(body);
  if (!parsedPatch.success) {
    return buildValidationErrorResponse(parsedPatch.error);
  }

  const sanitizedBody = {
    ...parsedPatch.data,
  } as TablesUpdate<'customer_profiles'>;

  if (sanitizedBody.billing_day_of_month !== undefined) {
    sanitizedBody.billing_day_of_month = Math.max(
      1,
      Math.min(28, Number(sanitizedBody.billing_day_of_month) || 25),
    );
  }
  if (sanitizedBody.monthly_price !== undefined) {
    sanitizedBody.monthly_price = Number(sanitizedBody.monthly_price) || 0;
  }
  if (sanitizedBody.pricing_status !== undefined) {
    sanitizedBody.pricing_status =
      sanitizedBody.pricing_status === 'unknown' ? 'unknown' : 'fixed';
    if (sanitizedBody.pricing_status === 'unknown') {
      sanitizedBody.monthly_price = 0;
    }
  }
  if (sanitizedBody.upcoming_monthly_price !== undefined) {
    sanitizedBody.upcoming_monthly_price =
      Number(sanitizedBody.upcoming_monthly_price) || null;
  }
  if (
    sanitizedBody.upcoming_price_effective_date !== undefined &&
    !sanitizedBody.upcoming_price_effective_date
  ) {
    sanitizedBody.upcoming_price_effective_date = null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitizedBody, 'account_manager')) {
    const assignment = await resolveAccountManagerAssignment(
      ctx.supabaseAdmin,
      sanitizedBody.account_manager as string | null | undefined,
    );
    sanitizedBody.account_manager = assignment.accountManager;
    sanitizedBody.account_manager_profile_id = assignment.accountManagerProfileId;
  }

  const nextPricingStatus =
    (sanitizedBody.pricing_status as string | undefined) ||
    existingProfile.pricing_status ||
    'fixed';
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
  const today = new Date().toISOString().slice(0, 10);
  const upcomingDueNow = Boolean(
    nextUpcomingPrice > 0 &&
      nextUpcomingEffectiveDate &&
      nextUpcomingEffectiveDate <= today,
  );

  if (hasActiveStripeSubscription && nextPricingStatus === 'unknown') {
    return jsonError(
      'Aktiv Stripe-prenumeration kan inte ha "pris ej satt". Avsluta eller pausa abonnemang forst.',
      400,
    );
  }

  if (
    hasActiveStripeSubscription &&
    nextPricingStatus === 'fixed' &&
    (upcomingDueNow || (monthlyPriceChanged && nextMonthlyPrice > 0))
  ) {
    if (!ctx.stripeClient) {
      return jsonError('Stripe ar inte konfigurerat pa servern', 503);
    }

    const syncedPrice = upcomingDueNow ? nextUpcomingPrice : nextMonthlyPrice;
    await applyPriceToSubscription({
      stripeClient: ctx.stripeClient,
      subscriptionId: String(existingProfile.stripe_subscription_id),
      monthlyPriceSek: syncedPrice,
      source: upcomingDueNow ? 'scheduled_upcoming' : 'admin_manual',
      supabaseAdmin: ctx.supabaseAdmin,
    });

    if (upcomingDueNow) {
      sanitizedBody.monthly_price = syncedPrice;
      sanitizedBody.pricing_status = 'fixed';
      sanitizedBody.upcoming_monthly_price = null;
      sanitizedBody.upcoming_price_effective_date = null;
    }
  }

  const { data, error } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .update(sanitizedBody)
    .eq('id', ctx.id)
    .select()
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  const nextContactEmail =
    typeof sanitizedBody.contact_email === 'string'
      ? sanitizedBody.contact_email.trim()
      : null;
  const previousContactEmail =
    typeof ctx.beforeProfile?.contact_email === 'string'
      ? ctx.beforeProfile.contact_email.trim()
      : null;

  if (
    ctx.stripeClient &&
    nextContactEmail &&
    nextContactEmail !== previousContactEmail &&
    typeof data.stripe_customer_id === 'string' &&
    data.stripe_customer_id
  ) {
    await ctx.stripeClient.customers.update(data.stripe_customer_id, {
      email: nextContactEmail,
      name:
        typeof data.business_name === 'string' && data.business_name
          ? data.business_name
          : undefined,
    });
  }

  await syncCustomerAssignmentFromProfile({
    supabaseAdmin: ctx.supabaseAdmin,
    customerProfileId: ctx.id,
  });
  await syncOperationalSubscriptionState({
    supabaseAdmin: ctx.supabaseAdmin,
    customerProfileId: ctx.id,
    profile: toOperationalProfileInput(data),
  });
  await recordAuditLog(ctx.supabaseAdmin, {
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    actorRole: ctx.user.role,
    action: 'admin.customer.updated',
    entityType: 'customer_profile',
    entityId: ctx.id,
    beforeState: ctx.beforeProfile,
    afterState: data as unknown as Record<string, unknown>,
  });

  return buildCustomerPayload(data);
}
