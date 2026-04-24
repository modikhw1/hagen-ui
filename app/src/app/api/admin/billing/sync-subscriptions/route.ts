import { NextRequest } from 'next/server';
import { z } from 'zod';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { type EnvFilter, buildBillingIdempotencyKey } from '@/lib/admin/billing';
import { syncBillingFromStripe } from '@/lib/admin/billing-service';
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
    env: z.enum(['test', 'live', 'all']).default('all'),
  })
  .strict();

export const POST = withAuth(async (request: NextRequest, user) => {
  requireScope(user, 'billing.subscriptions.write');

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return jsonError('Ogiltig billing-sync payload', 400);
  }

  const env = parsed.data.env satisfies EnvFilter;
  const supabaseAdmin = createSupabaseAdmin();
  const rateLimitStatus = await checkBillingSyncRateLimit({
    supabaseAdmin,
    adminUserId: user.id,
  });
  if (!rateLimitStatus.allowed) {
    return billingSyncRateLimitedResponse(rateLimitStatus.retryAfterSeconds);
  }

  const idempotencyKey = buildBillingIdempotencyKey({
    adminId: user.id,
    action: 'billing.sync_subscriptions',
    targetId: env,
  });

  let syncedCount = 0;
  let skippedCount = 0;
  let failedMessage: string | null = null;

  try {
    const payload = await syncBillingFromStripe({
      supabaseAdmin,
      env,
      idempotencyKey,
      kind: 'subscriptions',
    });
    syncedCount = payload.syncedCount;
    skippedCount = payload.skippedCount;

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'X-RateLimit-Limit': String(BILLING_SYNC_RATE_LIMIT_MAX_REQUESTS),
        'X-RateLimit-Remaining': String(Math.max(0, rateLimitStatus.remaining - 1)),
      },
    });
  } catch (error) {
    failedMessage = error instanceof Error ? error.message : 'Kunde inte synca abonnemang';
    return jsonError(failedMessage, 500);
  } finally {
    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'billing.sync_subscriptions',
      entityType: 'billing',
      entityId: env,
      metadata: {
        idempotency_key: idempotencyKey,
        status: failedMessage ? 'failed' : 'success',
        synced_count: syncedCount,
        skipped_count: skippedCount,
        error_message: failedMessage,
      },
    });
  }
}, ['admin']);
