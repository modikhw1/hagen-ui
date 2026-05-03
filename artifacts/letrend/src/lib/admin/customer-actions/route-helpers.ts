import 'server-only';

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import type { AdminScope } from '@/lib/admin/admin-roles';
import { revalidateAdminCustomerViews } from '@/lib/admin/cache-tags';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { requireAdminScope } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createAdminActionContext } from './context';
import { enforceCustomerActionRateLimit } from './rate-limit';
import {
  actionSuccess,
  buildRouteErrorResponse,
  buildValidationErrorResponse,
  isActionFailure,
  isActionSuccess,
} from './shared';
import type { ActionResult, AdminActionContext } from './types';
import { withRequestContext } from './with-request-context';

export interface CustomerActionRouteParams {
  params: Promise<unknown>;
}

async function resolveCustomerId(params: Promise<unknown>) {
  const value = await params;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' && id.trim() ? id : null;
}

type RouteHandler<TPayload> = (
  ctx: AdminActionContext,
  payload: TPayload,
) => Promise<ActionResult>;

type RouteOptions<TSchema extends z.ZodTypeAny, TPayload> = {
  schema?: TSchema;
  requiredScope?: AdminScope;
  scopeMessage?: string;
  buildPayload?: (data: z.infer<TSchema>) => TPayload;
  actionName?: string;
};

function normalizeActionResult(result: ActionResult): ActionResult {
  if (result instanceof Response) {
    return result;
  }

  if (isActionFailure(result) || isActionSuccess(result)) {
    return result;
  }

  return actionSuccess(result);
}

function withDefaultMeta(
  result: ActionResult,
  requestId: string,
  durationMs: number,
): ActionResult {
  if (result instanceof Response) {
    return result;
  }

  const meta = result.meta ?? {
    requestId,
    durationMs,
  };

  return {
    ...result,
    meta,
  };
}

function toActionResponse(id: string, result: ActionResult): Response {
  if (result instanceof Response) {
    if (result.ok) {
      revalidateAdminCustomerViews(id);
    }
    return result;
  }

  if (result.success === false) {
    return jsonError(result.error, result.statusCode ?? 400, {
      ...(result.details !== undefined ? { details: result.details } : {}),
      ...(result.meta ? { meta: result.meta } : {}),
    });
  }

  revalidateAdminCustomerViews(id);
  return jsonOk({
    success: true,
    data: result.data,
    ...(result.meta ? { meta: result.meta } : {}),
  });
}

export async function runCustomerActionRoute<
  TSchema extends z.ZodTypeAny,
  TPayload = z.infer<TSchema>,
>(
  request: NextRequest,
  { params }: CustomerActionRouteParams,
  handler: RouteHandler<TPayload>,
  options?: RouteOptions<TSchema, TPayload>,
) {
  const logContext: {
    action?: string;
    entityId?: string | null;
    actorUserId?: string | null;
    supabaseAdmin?: AdminActionContext['supabaseAdmin'];
  } = {};

  return withRequestContext({
    request,
    route: request.nextUrl.pathname,
    action: options?.actionName,
    getLogContext: () => logContext,
    execute: async () => {
      try {
        const id = await resolveCustomerId(params);
        if (!id) {
          return jsonError(SERVER_COPY.customerIdRequired, 400);
        }

        const ctx = await createAdminActionContext(request, id);
        logContext.entityId = id;
        logContext.actorUserId = ctx.user.id;
        logContext.supabaseAdmin = ctx.supabaseAdmin;

        if (options?.requiredScope) {
          requireAdminScope(ctx.user, options.requiredScope, options.scopeMessage);
        }

        const rawBody = await request.json().catch(() => ({}));
        if (!options?.schema) {
          const action =
            options?.actionName ??
            (rawBody &&
            typeof rawBody === 'object' &&
            typeof (rawBody as { action?: unknown }).action === 'string'
              ? (rawBody as { action: string }).action
              : undefined);
          if (action) {
            logContext.action = action;
          }

          const limitedResponse = await enforceCustomerActionRateLimit({
            ctx,
            action,
          });
          if (limitedResponse) {
            return limitedResponse;
          }

          const startedAt = performance.now();
          const handled = await handler(ctx, rawBody as TPayload);
          const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
          return toActionResponse(
            id,
            withDefaultMeta(
              normalizeActionResult(handled),
              ctx.requestId,
              durationMs,
            ),
          );
        }

        const parsed = options.schema.safeParse(rawBody);
        if (!parsed.success) {
          return buildValidationErrorResponse(parsed.error);
        }

        const payload = options.buildPayload
          ? options.buildPayload(parsed.data)
          : (parsed.data as TPayload);
        const action =
          options?.actionName ??
          (payload &&
          typeof payload === 'object' &&
          typeof (payload as { action?: unknown }).action === 'string'
            ? (payload as unknown as { action: string }).action
            : undefined);
        if (action) {
          logContext.action = action;
        }

        const limitedResponse = await enforceCustomerActionRateLimit({
          ctx,
          action,
        });
        if (limitedResponse) {
          return limitedResponse;
        }

        const startedAt = performance.now();
        const handled = await handler(ctx, payload);
        const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
        return toActionResponse(
          id,
          withDefaultMeta(normalizeActionResult(handled), ctx.requestId, durationMs),
        );
      } catch (error) {
        return buildRouteErrorResponse(error);
      }
    },
  });
}

export async function runCustomerDeleteRoute(
  request: NextRequest,
  { params }: CustomerActionRouteParams,
  handler: (ctx: AdminActionContext) => Promise<ActionResult>,
  options?: {
    requiredScope?: AdminScope;
    scopeMessage?: string;
    actionName?: string;
  },
) {
  const logContext: {
    action?: string;
    entityId?: string | null;
    actorUserId?: string | null;
    supabaseAdmin?: AdminActionContext['supabaseAdmin'];
  } = {};

  return withRequestContext({
    request,
    route: request.nextUrl.pathname,
    action: options?.actionName,
    getLogContext: () => logContext,
    execute: async () => {
      try {
        const id = await resolveCustomerId(params);
        if (!id) {
          return jsonError(SERVER_COPY.customerIdRequired, 400);
        }

        const ctx = await createAdminActionContext(request, id);
        logContext.entityId = id;
        logContext.actorUserId = ctx.user.id;
        logContext.supabaseAdmin = ctx.supabaseAdmin;
        if (options?.actionName) {
          logContext.action = options.actionName;
        }

        const limitedResponse = await enforceCustomerActionRateLimit({
          ctx,
          action: options?.actionName,
        });
        if (limitedResponse) {
          return limitedResponse;
        }

        if (options?.requiredScope) {
          requireAdminScope(ctx.user, options.requiredScope, options.scopeMessage);
        }

        const startedAt = performance.now();
        const handled = await handler(ctx);
        const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
        return toActionResponse(
          id,
          withDefaultMeta(normalizeActionResult(handled), ctx.requestId, durationMs),
        );
      } catch (error) {
        return buildRouteErrorResponse(error);
      }
    },
  });
}
