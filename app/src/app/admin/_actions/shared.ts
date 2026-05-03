import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import {
  getAdminRoles,
  type AdminScope,
} from '@/lib/admin/admin-roles';
import { revalidateAdminCustomerViews } from '@/lib/admin/cache-tags';
import { isMissingRelationError } from '@/lib/admin/schema-guards';
import {
  AuthError,
  requireAdminScope,
  type AuthenticatedUser,
  type UserRole,
} from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import type { AdminActionContext, ActionResult } from '@/lib/admin/customer-actions/types';

export type AdminActionError = {
  error: {
    code: string;
    message: string;
  };
};

export type AdminActionSuccess<T> = {
  data: T;
};

export type AdminActionResult<T> = AdminActionSuccess<T> | AdminActionError;

export function actionError(code: string, message: string): AdminActionError {
  return {
    error: {
      code,
      message,
    },
  };
}

export function actionData<T>(data: T): AdminActionSuccess<T> {
  return { data };
}

import { getAuthenticatedUser } from '@/lib/auth/shared-auth';

async function authenticateActionUser(
  requiredRoles: UserRole[] = ['admin'],
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();

  if (
    requiredRoles.length > 0 &&
    !requiredRoles.includes(user.role) &&
    !(requiredRoles.includes('admin') && user.is_admin)
  ) {
    throw new AuthError(403, 'Du saknar behörighet');
  }

  return user;
}

import { unstable_cache } from 'next/cache';

export async function getAdminActionSession(scope?: AdminScope) {
  // Use a very short cache (5 seconds) for the session to speed up multi-page navigation
  // The 'user-id' isn't available yet so we use a more generic tag-based approach
  // or just trust the underlying getAuthenticatedUser which should be fast.
  const user = await authenticateActionUser(['admin']);
  if (scope) {
    requireAdminScope(user, scope);
  }

  return {
    user,
    supabaseAdmin: createSupabaseAdmin(),
  };
}

export async function createAdminActionContextFromSession(
  id: string,
): Promise<AdminActionContext> {
  const { user, supabaseAdmin } = await getAdminActionSession();
  const beforeResult = await supabaseAdmin
    .from('customer_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (beforeResult.error) {
    throw new Error(beforeResult.error.message);
  }

  return {
    id,
    requestId: crypto.randomUUID(),
    user,
    clientIp: null,
    userAgent: null,
    supabaseAdmin,
    stripeClient: stripe,
    beforeProfile: beforeResult.data,
  };
}

async function responseToActionResult<T>(
  response: Response,
): Promise<AdminActionResult<T>> {
  const payload = await response.json().catch(() => ({})) as {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    return actionError(
      `HTTP_${response.status}`,
      payload.error || payload.message || 'Begäran misslyckades',
    );
  }

  return actionData(payload as T);
}

export async function normalizeAdminActionResult<T>(
  result: ActionResult | T,
): Promise<AdminActionResult<T>> {
  if (result instanceof Response) {
    return responseToActionResult<T>(result);
  }

  if (
    result &&
    typeof result === 'object' &&
    'success' in result &&
    (result as { success?: unknown }).success === false &&
    typeof (result as { error?: unknown }).error === 'string'
  ) {
    return actionError(
      'ACTION_FAILED',
      String((result as { error: string }).error),
    );
  }

  if (
    result &&
    typeof result === 'object' &&
    'success' in result &&
    (result as { success?: unknown }).success === true &&
    'data' in result
  ) {
    return actionData((result as { data: T }).data);
  }

  return actionData(result as T);
}

function mapErrorToAction(error: unknown): AdminActionError {
  if (error instanceof AuthError) {
    if (error.statusCode === 401) {
      return actionError('UNAUTHENTICATED', error.message);
    }

    if (error.statusCode === 403) {
      return actionError('FORBIDDEN', error.message);
    }

    return actionError('AUTH_ERROR', error.message);
  }

  if (error instanceof Error) {
    return actionError('INTERNAL_SERVER_ERROR', error.message);
  }

  return actionError('INTERNAL_SERVER_ERROR', 'Internt serverfel');
}

export async function runAdminCustomerAction<T>(params: {
  id: string;
  scope?: AdminScope;
  revalidate?: boolean;
  work: (ctx: AdminActionContext) => Promise<ActionResult | T>;
}): Promise<AdminActionResult<T>> {
  try {
    const ctx = await createAdminActionContextFromSession(params.id);
    if (params.scope) {
      requireAdminScope(ctx.user, params.scope);
    }

    const result = await params.work(ctx);
    const normalized = await normalizeAdminActionResult<T>(result);

    if (!('error' in normalized) && params.revalidate !== false) {
      revalidateAdminCustomerViews(params.id);
    }

    return normalized;
  } catch (error) {
    return mapErrorToAction(error);
  }
}

export type { AuthenticatedUser };
