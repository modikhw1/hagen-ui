import { z } from 'zod';
import { recordAdminAction } from '@/lib/admin/audit';
import { withRequestContext } from '@/lib/admin/customer-actions/with-request-context';
import { getPayrollExportRows } from '@/lib/admin/payroll';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const querySchema = z.object({
  period: z.string().trim().min(1),
  cmId: z.string().trim().min(1).optional(),
  format: z.enum(['csv', 'json']).default('csv'),
});

function escapeCsv(value: string | number | null | undefined) {
  const safe = String(value ?? '');
  return `"${safe.replaceAll('"', '""')}"`;
}

function toCsv(rows: Awaited<ReturnType<typeof getPayrollExportRows>>['rows']) {
  const header = [
    'period_key',
    'period_label',
    'cm_id',
    'cm_name',
    'cm_email',
    'commission_rate_percent',
    'customer_id',
    'customer_name',
    'billed_ore',
    'payout_ore',
    'billable_days',
  ].join(',');

  const lines = rows.map((row) =>
    [
      escapeCsv(row.period_key),
      escapeCsv(row.period_label),
      escapeCsv(row.cm_id),
      escapeCsv(row.cm_name),
      escapeCsv(row.cm_email),
      escapeCsv(row.commission_rate_percent),
      escapeCsv(row.customer_id),
      escapeCsv(row.customer_name),
      escapeCsv(row.billed_ore),
      escapeCsv(row.payout_ore),
      escapeCsv(row.billable_days),
    ].join(','),
  );

  return `${header}\n${lines.join('\n')}\n`;
}

function fileName(period: string, cmId: string | undefined, format: 'csv' | 'json') {
  const base = cmId ? `payroll-${period}-${cmId}` : `payroll-${period}`;
  return `${base}.${format}`;
}

export const GET = withAuth(async (request, user) => {
  const supabaseAdmin = createSupabaseAdmin();

  return withRequestContext({
    request,
    route: request.nextUrl.pathname,
    action: 'payroll_export_get',
    actorUserId: user.id,
    supabaseAdmin,
    execute: async () => {
      try {
        requireScope(user, 'payroll.read');

        const parsed = querySchema.safeParse({
          period: request.nextUrl.searchParams.get('period') ?? undefined,
          cmId: request.nextUrl.searchParams.get('cmId') ?? undefined,
          format: request.nextUrl.searchParams.get('format') ?? undefined,
        });

        if (!parsed.success) {
          return jsonError('Ogiltiga query-parametrar för payroll-export', 400);
        }

        const payload = await getPayrollExportRows(supabaseAdmin, {
          period: parsed.data.period,
          cmId: parsed.data.cmId,
        });

        await recordAdminAction(supabaseAdmin, {
          actorId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          action: 'payroll.export',
          entityType: 'payroll_period',
          entityId: parsed.data.period,
          metadata: {
            cm_id: parsed.data.cmId ?? null,
            format: parsed.data.format,
            row_count: payload.rows.length,
          },
        }).catch(() => undefined);

        if (parsed.data.format === 'json') {
          return new Response(JSON.stringify(payload, null, 2), {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Disposition': `attachment; filename="${fileName(parsed.data.period, parsed.data.cmId, 'json')}"`,
              'Cache-Control': 'private, no-cache',
            },
          });
        }

        return new Response(toCsv(payload.rows), {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${fileName(parsed.data.period, parsed.data.cmId, 'csv')}"`,
            'Cache-Control': 'private, no-cache',
          },
        });
      } catch (error) {
        return jsonError(
          error instanceof Error ? error.message : 'Kunde inte exportera payroll',
          500,
        );
      }
    },
  });
}, ['admin']);
