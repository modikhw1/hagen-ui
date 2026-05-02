import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { isMissingRelationError } from '@/lib/admin/schema-guards';
import { stripe } from '@/lib/stripe/dynamic-config';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import type { Database } from '@/types/database';

type PendingAttachmentRow = {
  id: string;
  customer_profile_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  reason: 'profile_update_failed' | 'invite_recovery' | 'manual_repair';
  metadata: Record<string, unknown> | null;
  created_at: string;
  status?: 'pending' | 'reconciled' | 'failed';
  retry_count?: number;
};

type ReconcileResult = {
  scanned: number;
  reconciled: number;
  failed: number;
  retried: number;
};

async function listPendingAttachments(
  supabaseAdmin: SupabaseClient<Database>,
  now: Date,
) {
  const minCreatedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const result = await (((supabaseAdmin.from('pending_stripe_attachments' as never) as never) as {
    select: (columns: string) => {
      lte: (column: string, value: string) => Promise<{
        data: PendingAttachmentRow[] | null;
        error: { message?: string } | null;
      }>;
    };
  }).select(
    'id, customer_profile_id, stripe_customer_id, stripe_subscription_id, stripe_product_id, stripe_price_id, reason, metadata, created_at, status, retry_count',
  )).lte('created_at', minCreatedAt);

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return [];
    }
    throw new Error(result.error.message || 'Kunde inte läsa pending Stripe-attachments');
  }

  return (result.data ?? []).filter((row) => (row.status ?? 'pending') === 'pending');
}

async function markAttachment(
  supabaseAdmin: SupabaseClient<Database>,
  id: string,
  patch: Record<string, unknown>,
) {
  await (((supabaseAdmin.from('pending_stripe_attachments' as never) as never) as {
    update: (value: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
    };
  }).update(patch)).eq('id', id);
}

async function reconcileInviteRecovery(params: {
  supabaseAdmin: SupabaseClient<Database>;
  row: PendingAttachmentRow;
}) {
  const profileResult = await params.supabaseAdmin
    .from('customer_profiles')
    .select('id, business_name, contact_email')
    .eq('id', params.row.customer_profile_id)
    .maybeSingle();
  if (profileResult.error || !profileResult.data?.contact_email) {
    throw new Error(profileResult.error?.message || 'Kunden saknar kontaktmail för återinbjudan');
  }

  const inviteResult = await params.supabaseAdmin.auth.admin.inviteUserByEmail(
    profileResult.data.contact_email,
    {
      data: {
        business_name: profileResult.data.business_name,
        customer_profile_id: profileResult.data.id,
        stripe_customer_id: params.row.stripe_customer_id,
        stripe_subscription_id: params.row.stripe_subscription_id,
      },
    },
  );
  if (inviteResult.error) {
    throw new Error(inviteResult.error.message);
  }
}

async function reconcileProfileUpdateFailure(params: {
  supabaseAdmin: SupabaseClient<Database>;
  row: PendingAttachmentRow;
}) {
  const updateResult = await params.supabaseAdmin
    .from('customer_profiles')
    .update({
      stripe_customer_id: params.row.stripe_customer_id,
      stripe_subscription_id: params.row.stripe_subscription_id,
    } as never)
    .eq('id', params.row.customer_profile_id);
  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }
}

async function cleanupStaleStripeObjects(params: {
  stripeClient: Stripe | null;
  row: PendingAttachmentRow;
  now: Date;
}) {
  if (!params.stripeClient) return;
  const createdAtMs = Date.parse(params.row.created_at);
  if (!Number.isFinite(createdAtMs) || params.now.getTime() - createdAtMs < 24 * 60 * 60 * 1000) {
    return;
  }

  if (params.row.stripe_subscription_id) {
    await params.stripeClient.subscriptions.cancel(params.row.stripe_subscription_id).catch(() => undefined);
  }
  if (params.row.stripe_product_id) {
    await params.stripeClient.products.del(params.row.stripe_product_id).catch(() => undefined);
  }
}

export async function runStripeOrphanReconcile(params?: {
  supabaseAdmin?: SupabaseClient<Database>;
  stripeClient?: Stripe | null;
  now?: Date;
}): Promise<ReconcileResult> {
  const supabaseAdmin = params?.supabaseAdmin ?? createSupabaseAdmin();
  const stripeClient = params?.stripeClient ?? stripe;
  const now = params?.now ?? new Date();
  const rows = await listPendingAttachments(supabaseAdmin, now);

  const summary: ReconcileResult = {
    scanned: rows.length,
    reconciled: 0,
    failed: 0,
    retried: 0,
  };

  for (const row of rows) {
    const retryCount = Number(row.retry_count ?? 0);
    try {
      if (row.reason === 'invite_recovery') {
        await reconcileInviteRecovery({ supabaseAdmin, row });
      } else if (row.reason === 'profile_update_failed') {
        await reconcileProfileUpdateFailure({ supabaseAdmin, row });
      }

      await markAttachment(supabaseAdmin, row.id, {
        status: 'reconciled',
        reconciled_at: now.toISOString(),
        last_error: null,
      });
      summary.reconciled += 1;
    } catch (error) {
      await cleanupStaleStripeObjects({
        stripeClient,
        row,
        now,
      });
      const nextRetry = retryCount + 1;
      const failedFinal = nextRetry >= 3;
      await markAttachment(supabaseAdmin, row.id, {
        status: failedFinal ? 'failed' : 'pending',
        retry_count: nextRetry,
        last_error: error instanceof Error ? error.message : 'Unknown reconciliation error',
        next_retry_at: failedFinal
          ? null
          : new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      });

      await recordAuditLog(supabaseAdmin, {
        actorUserId: null,
        actorRole: 'system',
        action: failedFinal
          ? 'system.stripe_orphan.reconcile_failed_final'
          : 'system.stripe_orphan.reconcile_failed',
        entityType: 'pending_stripe_attachment',
        entityId: row.id,
        metadata: {
          customer_profile_id: row.customer_profile_id,
          reason: row.reason,
          retry_count: nextRetry,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      summary.failed += 1;
      if (!failedFinal) {
        summary.retried += 1;
      }
    }
  }

  return summary;
}
