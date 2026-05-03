import { NextRequest } from 'next/server';
import { z } from 'zod';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import {
  BILLING_SYNC_RATE_LIMIT_MAX_REQUESTS,
  billingSyncRateLimitedResponse,
  checkBillingSyncRateLimit,
} from '@/lib/admin/server/billing-rate-limit';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const bodySchema = z
  .object({
    scope: z.enum(['invoices', 'subscriptions', 'all']).default('all'),
    environment: z.enum(['live', 'test']).default('live'),
    since: z.string().datetime().optional(),
  })
  .strict();

export const POST = withAuth(async (request: NextRequest, user) => {
  requireScope(user, 'super_admin', SERVER_COPY.superAdminOnly);

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(SERVER_COPY.invalidPayload, 400, {
      details: parsed.error.issues,
    });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const rateLimitStatus = await checkBillingSyncRateLimit({
    supabaseAdmin,
    adminUserId: user.id,
  });
  if (!rateLimitStatus.allowed) {
    return billingSyncRateLimitedResponse(rateLimitStatus.retryAfterSeconds);
  }

  const jobId = crypto.randomUUID();
  await (((supabaseAdmin.from('admin_billing_reconcile_jobs' as never) as never) as {
    insert: (value: Record<string, unknown>) => Promise<{
      error: { message?: string } | null;
    }>;
  }).insert({
    id: jobId,
    requested_by: user.id,
    scope: parsed.data.scope,
    environment: parsed.data.environment,
    since: parsed.data.since ?? null,
    status: 'queued',
    payload: parsed.data,
  })).catch(() => undefined);

  await recordAuditLog(supabaseAdmin, {
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'billing.reconcile.request',
    entityType: 'billing',
    entityId: jobId,
    metadata: {
      scope: parsed.data.scope,
      environment: parsed.data.environment,
      since: parsed.data.since ?? null,
      queued: true,
    },
  });

  return new Response(
    JSON.stringify({
      jobId,
      queued: true,
    }),
    {
      status: 202,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': String(BILLING_SYNC_RATE_LIMIT_MAX_REQUESTS),
        'X-RateLimit-Remaining': String(Math.max(0, rateLimitStatus.remaining - 1)),
      },
    },
  );
}, ['admin']);
