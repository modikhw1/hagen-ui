import 'server-only';

import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { actionFailure } from './shared';
import type { ActionResult, AdminActionContext } from './types';

const LOCK_TTL_MS = 2 * 60 * 1000;

type LockTableClient = {
  delete: () => {
    eq: (column: string, value: string) => {
      lt: (expiresColumn: string, iso: string) => Promise<{ error: { message?: string } | null }>;
      eq: (requestColumn: string, requestId: string) => Promise<{ error: { message?: string } | null }>;
    };
  };
  insert: (value: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
};

function lockTable(ctx: AdminActionContext): LockTableClient {
  return ((ctx.supabaseAdmin.from('admin_customer_action_locks' as never) as never) as LockTableClient);
}

export async function withCustomerActionLock(
  ctx: AdminActionContext,
  scope: string,
  fn: () => Promise<ActionResult>,
): Promise<ActionResult> {
  const nowIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + LOCK_TTL_MS).toISOString();
  const key = `cust:${ctx.id}:${scope}`;
  const table = lockTable(ctx);

  if (typeof table.insert !== 'function' || typeof table.delete !== 'function') {
    return fn();
  }

  await table.delete().eq('lock_key', key).lt('expires_at', nowIso);

  const acquire = await table.insert({
    lock_key: key,
    customer_profile_id: ctx.id,
    request_id: ctx.requestId,
    created_by: ctx.user.id,
    expires_at: expiresAtIso,
  });

  if (acquire.error) {
    return actionFailure({
      error: SERVER_COPY.concurrentActionInProgress,
      statusCode: 409,
    });
  }

  try {
    return await fn();
  } finally {
    await table.delete().eq('lock_key', key).eq('request_id', ctx.requestId);
  }
}
