import { NextRequest } from 'next/server';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { buildBillingIdempotencyKey } from '@/lib/admin/billing';
import {
  findRecentBillingResult,
  syncBillingFromStripe,
} from '@/lib/admin/billing-service';
import {
  BILLING_SYNC_RATE_LIMIT_MAX_REQUESTS,
  billingSyncRateLimitedResponse,
  checkBillingSyncRateLimit,
} from '@/lib/admin/server/billing-rate-limit';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { getStripeEnvironment } from '@/lib/stripe/environment';

export const POST = withAuth(async (_request: NextRequest, user) => {
  requireScope(user, 'billing.health.retry');

  const supabaseAdmin = createSupabaseAdmin();
  const environment = getStripeEnvironment();
  const idempotencyKey = buildBillingIdempotencyKey({
    adminId: user.id,
    action: 'billing.health_retry',
    targetId: environment,
    precision: 'hour',
  });

  const cached = await findRecentBillingResult({
    supabaseAdmin,
    idempotencyKey,
    withinMs: 60_000,
  });

  if (cached) {
    return new Response(
      JSON.stringify({
        ...(typeof cached === 'object' && cached ? cached : {}),
        idempotencyKey,
        replayed: true,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      },
    );
  }

  const rateLimitStatus = await checkBillingSyncRateLimit({
    supabaseAdmin,
    adminUserId: user.id,
  });
  if (!rateLimitStatus.allowed) {
    return billingSyncRateLimitedResponse(rateLimitStatus.retryAfterSeconds);
  }

  let payload:
    | {
        ok: boolean;
        idempotencyKey: string;
        replayed: boolean;
        syncedCount: number;
        skippedCount: number;
        invoices: { syncedCount: number; skippedCount: number };
        subscriptions: { syncedCount: number; skippedCount: number };
      }
    | null = null;
  let failedMessage: string | null = null;

  try {
    const [invoices, subscriptions] = await Promise.all([
      syncBillingFromStripe({
        supabaseAdmin,
        env: environment,
        idempotencyKey: buildBillingIdempotencyKey({
          adminId: user.id,
          action: 'billing.sync_invoices',
          targetId: environment,
        }),
        kind: 'invoices',
      }),
      syncBillingFromStripe({
        supabaseAdmin,
        env: environment,
        idempotencyKey: buildBillingIdempotencyKey({
          adminId: user.id,
          action: 'billing.sync_subscriptions',
          targetId: environment,
        }),
        kind: 'subscriptions',
      }),
    ]);

    payload = {
      ok: true,
      idempotencyKey,
      replayed: false,
      syncedCount: invoices.syncedCount + subscriptions.syncedCount,
      skippedCount: invoices.skippedCount + subscriptions.skippedCount,
      invoices,
      subscriptions,
    };

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
    failedMessage = error instanceof Error ? error.message : 'Kunde inte köra om billing-sync';
    return jsonError(failedMessage, 500);
  } finally {
    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'billing.health_retry',
      entityType: 'billing',
      entityId: environment,
      metadata: {
        idempotency_key: idempotencyKey,
        status: failedMessage ? 'failed' : 'success',
        synced_count: payload?.syncedCount ?? 0,
        skipped_count: payload?.skippedCount ?? 0,
        error_message: failedMessage,
      },
    });
  }
}, ['admin']);
