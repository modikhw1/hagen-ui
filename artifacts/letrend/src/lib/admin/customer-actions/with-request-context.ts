import 'server-only';

import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type RequestContextParams = {
  request: NextRequest;
  route: string;
  action?: string;
  entityId?: string | null;
  actorUserId?: string | null;
  supabaseAdmin?: SupabaseClient<Database>;
  getLogContext?: () => {
    action?: string;
    entityId?: string | null;
    actorUserId?: string | null;
    supabaseAdmin?: SupabaseClient<Database>;
  };
  execute: () => Promise<Response>;
};

function appendRequestHeaders(response: Response, requestId: string, durationMs: number) {
  const headers = new Headers(response.headers);
  headers.set('x-request-id', requestId);
  headers.set('Server-Timing', `app;dur=${durationMs}`);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function insertRequestLog(params: {
  supabaseAdmin: SupabaseClient<Database>;
  requestId: string;
  route: string;
  action?: string;
  entityId?: string | null;
  actorUserId?: string | null;
  statusCode: number;
  durationMs: number;
}) {
  await (
    ((params.supabaseAdmin.from('admin_request_log' as never) as never) as {
      insert: (value: Record<string, unknown>) => Promise<{
        error: { message?: string } | null;
      }>;
    }).insert({
    request_id: params.requestId,
    actor_user_id: params.actorUserId ?? null,
    route: params.route,
    action: params.action ?? null,
    entity_id: params.entityId ?? null,
    status_code: params.statusCode,
    duration_ms: params.durationMs,
    })
  );
}

function emitDurationMetric(params: {
  route: string;
  action?: string;
  requestId: string;
  durationMs: number;
  statusCode: number;
}) {
  const maybeGlobal = globalThis as {
    posthog?: {
      capture?: (event: string, properties?: Record<string, unknown>) => void;
    };
  };

  maybeGlobal.posthog?.capture?.('admin.action.duration', {
    route: params.route,
    action: params.action ?? 'unknown',
    request_id: params.requestId,
    duration_ms: params.durationMs,
    status_code: params.statusCode,
  });
}

export async function withRequestContext(params: RequestContextParams): Promise<Response> {
  const requestId = params.request.headers.get('x-request-id') || crypto.randomUUID();
  const startedAt = performance.now();
  let response: Response | null = null;

  try {
    response = await params.execute();
  } finally {
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    const statusCode = response?.status ?? 500;
    const dynamicLogContext = params.getLogContext?.();
    const resolvedAction = dynamicLogContext?.action ?? params.action;
    const resolvedEntityId = dynamicLogContext?.entityId ?? params.entityId;
    const resolvedActorUserId = dynamicLogContext?.actorUserId ?? params.actorUserId;
    const resolvedSupabaseAdmin =
      dynamicLogContext?.supabaseAdmin ?? params.supabaseAdmin;

    emitDurationMetric({
      route: params.route,
      action: resolvedAction,
      requestId,
      durationMs,
      statusCode,
    });

    if (resolvedSupabaseAdmin) {
      await insertRequestLog({
        supabaseAdmin: resolvedSupabaseAdmin,
        requestId,
        route: params.route,
        action: resolvedAction,
        entityId: resolvedEntityId,
        actorUserId: resolvedActorUserId,
        statusCode,
        durationMs,
      }).catch(() => undefined);
    }

    if (response) {
      response = appendRequestHeaders(response, requestId, durationMs);
    }
  }

  if (!response) {
    return new Response(null, {
      status: 500,
      headers: {
        'x-request-id': requestId,
      },
    });
  }

  return response;
}
