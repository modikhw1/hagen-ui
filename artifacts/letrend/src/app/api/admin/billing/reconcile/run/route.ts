import { NextRequest } from 'next/server';
import { z } from 'zod';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { syncBillingFromStripe } from '@/lib/admin/billing-service';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const bodySchema = z
  .object({
    jobId: z.string().uuid().optional(),
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

async function claimJob(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  jobId?: string,
) {
  const table = supabaseAdmin.from('admin_billing_reconcile_jobs' as never) as never as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order?: (column: string, options: { ascending: boolean }) => {
          limit: (value: number) => {
            maybeSingle: () => Promise<{
              data: JobRow | null;
              error: { message?: string } | null;
            }>;
          };
        };
        maybeSingle?: () => Promise<{
          data: JobRow | null;
          error: { message?: string } | null;
        }>;
      };
    };
    update: (value: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
    };
  };

  let job: JobRow | null = null;

  if (jobId) {
    const result = await table
      .select('id, scope, environment, since, status, requested_by')
      .eq('id', jobId)
      .maybeSingle!();
    job = result.data;
  } else {
    const result = await table
      .select('id, scope, environment, since, status, requested_by')
      .eq('status', 'queued')
      .order!('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    job = result.data;
  }

  if (!job) return null;
  if (job.status !== 'queued') return job;

  await table
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.id);

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
      const result = await syncBillingFromStripe({
        supabaseAdmin,
        env: job.environment,
        idempotencyKey: `${idempotencyKey}-${kind}`,
        kind,
      });
      totalSynced += result.syncedCount;
      totalSkipped += result.skippedCount;
    }

    const result = {
      syncedCount: totalSynced,
      skippedCount: totalSkipped,
      durationMs: Date.now() - startedAt,
    };

    await (supabaseAdmin.from('admin_billing_reconcile_jobs' as never) as never as {
      update: (value: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<unknown> };
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

    return new Response(
      JSON.stringify({ ok: true, jobId: job.id, status: 'succeeded', result }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Okänt fel';

    await (supabaseAdmin.from('admin_billing_reconcile_jobs' as never) as never as {
      update: (value: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<unknown> };
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

    return new Response(
      JSON.stringify({ ok: false, jobId: job.id, status: 'failed', error: message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}, ['admin']);
