import { NextRequest } from 'next/server';
import { z } from 'zod';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { syncBillingFromStripe } from '@/lib/admin/billing-service';

/**
 * Leverans 5: Reconcile-executor.
 *
 * POST kör nästa queued jobb (eller ett angivet jobId) synkront och uppdaterar
 * status. Anropas av Health-vyn ELLER av en cron / scheduled function.
 *
 * Designad så att samma endpoint kan triggas både manuellt (admin klickar)
 * och automatiskt (Vercel cron / Supabase scheduled function).
 */

const bodySchema = z
  .object({
    jobId: z.string().uuid().optional(),
    /** Cron-läge: hoppa över auth-check när ett delat secret finns. */
    cronToken: z.string().optional(),
  })
  .strict();

type JobRow = {
  id: string;
  scope: 'invoices' | 'subscriptions' | 'all';
  environment: 'live' | 'test';
  since: string | null;
  status: string;
  requested_by: string | null;
};

async function claimJob(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>, jobId?: string) {
  const table = supabaseAdmin.from('admin_billing_reconcile_jobs' as never) as never as {
    select: (cols: string) => {
      eq: (c: string, v: string) => {
        order?: (c: string, o: { ascending: boolean }) => {
          limit: (n: number) => { maybeSingle: () => Promise<{ data: JobRow | null; error: { message?: string } | null }> };
        };
        maybeSingle?: () => Promise<{ data: JobRow | null; error: { message?: string } | null }>;
      };
    };
    update: (v: Record<string, unknown>) => {
      eq: (c: string, v: string) => Promise<{ error: { message?: string } | null }>;
    };
  };

  let job: JobRow | null = null;

  if (jobId) {
    const r = await (table.select('id, scope, environment, since, status, requested_by').eq('id', jobId).maybeSingle!());
    job = r.data;
  } else {
    const r = await (table.select('id, scope, environment, since, status, requested_by').eq('status', 'queued').order!('created_at', { ascending: true }).limit(1).maybeSingle());
    job = r.data;
  }

  if (!job) return null;
  if (job.status !== 'queued') return job; // redan tagen

  await table.update({ status: 'running', started_at: new Date().toISOString() }).eq('id', job.id);
  return job;
}

export const POST = withAuth(async (request: NextRequest, user) => {
  requireScope(user, 'super_admin', SERVER_COPY.superAdminOnly);

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(SERVER_COPY.invalidPayload, 400, { details: parsed.error.issues });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const job = await claimJob(supabaseAdmin, parsed.data.jobId);

  if (!job) {
    return new Response(JSON.stringify({ ok: true, message: 'Inga köade reconcile-jobb' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (job.status === 'running' && !parsed.data.jobId) {
    return new Response(JSON.stringify({ ok: false, message: 'Annan körning pågår redan' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const idempotencyKey = `reconcile-${job.id}`;
  const startedAt = Date.now();

  try {
    let totalSynced = 0;
    let totalSkipped = 0;

    const kinds: Array<'invoices' | 'subscriptions'> =
      job.scope === 'all' ? ['invoices', 'subscriptions'] : [job.scope];

    for (const kind of kinds) {
      const r = await syncBillingFromStripe({
        supabaseAdmin,
        env: job.environment,
        idempotencyKey: `${idempotencyKey}-${kind}`,
        kind,
      });
      totalSynced += r.syncedCount;
      totalSkipped += r.skippedCount;
    }

    const result = {
      syncedCount: totalSynced,
      skippedCount: totalSkipped,
      durationMs: Date.now() - startedAt,
    };

    await (supabaseAdmin.from('admin_billing_reconcile_jobs' as never) as never as {
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
    })
      .update({
        status: 'succeeded',
        finished_at: new Date().toISOString(),
        result,
      })
      .eq('id', job.id);

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'billing.reconcile.complete',
      entityType: 'billing',
      entityId: job.id,
      metadata: { ...result, scope: job.scope, environment: job.environment },
    });

    return new Response(JSON.stringify({ ok: true, jobId: job.id, status: 'succeeded', result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel';

    await (supabaseAdmin.from('admin_billing_reconcile_jobs' as never) as never as {
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
    })
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: message,
      })
      .eq('id', job.id);

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'billing.reconcile.failed',
      entityType: 'billing',
      entityId: job.id,
      metadata: { error: message, scope: job.scope, environment: job.environment },
    });

    return new Response(JSON.stringify({ ok: false, jobId: job.id, status: 'failed', error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}, ['admin']);
