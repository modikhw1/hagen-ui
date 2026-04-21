import 'server-only';

import type { z } from 'zod';
import { AuthError } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import type { Tables } from '@/types/database';
import type { AdminActionContext } from './types';

export function buildValidationErrorResponse(error: z.ZodError) {
  return jsonError('Ogiltig payload', 400, {
    details: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

export function buildRouteErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return jsonError(error.message, error.statusCode);
  }

  if (
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return jsonError(error.message, error.statusCode);
  }

  const message =
    error instanceof Error ? error.message : 'Internt serverfel';
  return jsonError(message, 500);
}

export function toOperationalProfileInput(
  profile: Tables<'customer_profiles'>,
) {
  return {
    id: String(profile.id),
    stripe_subscription_id:
      typeof profile.stripe_subscription_id === 'string'
        ? profile.stripe_subscription_id
        : null,
    paused_until:
      typeof profile.paused_until === 'string' ? profile.paused_until : null,
    monthly_price: Number(profile.monthly_price) || 0,
    upcoming_monthly_price:
      Number(profile.upcoming_monthly_price) || null,
    upcoming_price_effective_date:
      typeof profile.upcoming_price_effective_date === 'string'
        ? profile.upcoming_price_effective_date
        : null,
  };
}

export function buildCustomerActionAuditMetadata(
  ctx: Pick<AdminActionContext, 'id'>,
  extra?: Record<string, unknown> | null,
) {
  return {
    customer_profile_id: ctx.id,
    ...(extra ?? {}),
  };
}
