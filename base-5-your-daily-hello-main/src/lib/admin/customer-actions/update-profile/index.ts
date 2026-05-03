import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { syncCustomerAssignmentFromProfile } from '@/lib/admin/cm-assignments';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { buildCustomerPayload } from '@/lib/admin/customer-detail/load';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import { hasAdminScope } from '@/lib/auth/api-auth';
import {
  actionFailure,
  actionSuccess,
  buildCustomerActionAuditMetadata,
  toOperationalProfileInput,
} from '../shared';
import type { ActionResult, AdminActionContext } from '../types';
import { normalizeProfilePatch } from './normalize';
import {
  syncStripeContactInfo,
  syncStripePricing,
} from './sync-stripe';
import { validatePricingUpdate } from './validate-pricing';

export async function updateCustomerProfile(
  ctx: AdminActionContext,
  body: unknown,
): Promise<ActionResult> {
  const { data: existingProfile, error: existingProfileError } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .select(
      'id, monthly_price, pricing_status, stripe_subscription_id, stripe_customer_id, upcoming_monthly_price, upcoming_price_effective_date',
    )
    .eq('id', ctx.id)
    .single();
  if (existingProfileError || !existingProfile) {
    return actionFailure({
      error: existingProfileError?.message || SERVER_COPY.customerNotFound,
      statusCode: 404,
    });
  }

  const normalized = await normalizeProfilePatch(ctx, body);
  if (!normalized.ok) {
    return actionFailure({
      error: normalized.error,
      statusCode: normalized.statusCode,
      details: normalized.details,
    });
  }

  const validated = validatePricingUpdate({
    existingProfile,
    sanitizedBody: normalized.value.sanitizedBody,
  });
  if (!validated.ok) {
    return actionFailure({
      error: validated.error,
      statusCode: validated.statusCode,
      details: validated.details,
    });
  }

  if (
    validated.value.hasActiveStripeSubscription &&
    validated.value.priceIntent.kind !== 'unchanged' &&
    !hasAdminScope(ctx.user, 'super_admin')
  ) {
    return actionFailure({
      error: SERVER_COPY.superAdminOnly,
      statusCode: 403,
    });
  }

  const syncedPricing = await syncStripePricing({
    ctx,
    existingProfile,
    sanitizedBody: validated.value.sanitizedBody,
    priceIntent: validated.value.priceIntent,
  });
  if (!syncedPricing.ok) {
    return actionFailure({
      error: syncedPricing.error,
      statusCode: syncedPricing.statusCode,
      details: syncedPricing.details,
    });
  }

  const { data, error } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .update(syncedPricing.value)
    .eq('id', ctx.id)
    .select()
    .single();
  if (error) {
    return actionFailure({ error: error.message, statusCode: 500 });
  }

  await syncStripeContactInfo({
    ctx,
    profile: data,
    updatePayload: syncedPricing.value,
  });

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
    metadata: buildCustomerActionAuditMetadata(ctx, {
      price_intent: validated.value.priceIntent.kind,
    }),
  });

  return actionSuccess(buildCustomerPayload(data));
}
