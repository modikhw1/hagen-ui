import 'server-only';

import type { z } from 'zod';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { AuthError } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import type { Tables } from '@/types/database';
import type {
  ActionFailure,
  ActionResult,
  ActionSuccess,
  AdminActionContext,
} from './types';

export function buildValidationErrorResponse(error: z.ZodError) {
  return jsonError(SERVER_COPY.invalidPayload, 400, {
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
    error instanceof Error ? error.message : SERVER_COPY.serverError;
  return jsonError(message, 500);
}

export function actionSuccess<T>(
  data: T,
  meta?: ActionSuccess<T>['meta'],
): ActionSuccess<T> {
  return {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };
}

export function actionFailure(params: {
  error: string;
  statusCode?: number;
  details?: unknown;
  meta?: ActionFailure['meta'];
}): ActionFailure {
  return {
    success: false,
    error: params.error,
    ...(params.statusCode ? { statusCode: params.statusCode } : {}),
    ...(params.details !== undefined ? { details: params.details } : {}),
    ...(params.meta ? { meta: params.meta } : {}),
  };
}

export function isActionFailure(result: ActionResult): result is ActionFailure {
  return (
    !(result instanceof Response) &&
    result.success === false &&
    typeof result.error === 'string'
  );
}

export function isActionSuccess<T>(
  result: ActionResult<T>,
): result is ActionSuccess<T> {
  return !(result instanceof Response) && result.success === true;
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
  ctx: Pick<
    AdminActionContext,
    'id' | 'requestId' | 'clientIp' | 'userAgent' | 'user'
  >,
  extra?: Record<string, unknown> | null,
) {
  return {
    customer_profile_id: ctx.id,
    request_id: ctx.requestId,
    idempotency_key: ctx.requestId,
    actor_scope: Array.isArray(ctx.user.admin_roles)
      ? ctx.user.admin_roles
      : [],
    client_ip: ctx.clientIp ?? null,
    user_agent: ctx.userAgent ?? null,
    ...(extra ?? {}),
  };
}
