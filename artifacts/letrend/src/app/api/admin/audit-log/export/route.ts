import { z } from 'zod';
import { formatAuditMetadata } from '@/lib/admin-derive/audit';
import { listAuditLog } from '@/lib/admin/audit-log';
import { auditLogFilterSchema } from '@/lib/admin/schemas/audit';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const formatSchema = z.enum(['csv', 'json']).default('csv');

function escapeCsv(value: string | null | undefined) {
  const safe = value ?? '';
  return `"${safe.replaceAll('"', '""')}"`;
}

export const GET = withAuth(async (request, user) => {
  requireScope(user, 'audit.read');
  const onlyErrorsParam = request.nextUrl.searchParams.get('onlyErrors');
  const billingOnlyParam = request.nextUrl.searchParams.get('billingOnly');

  const parsed = auditLogFilterSchema.safeParse({
    actor: request.nextUrl.searchParams.get('actor') ?? undefined,
    action: request.nextUrl.searchParams.get('action') ?? undefined,
    entity: request.nextUrl.searchParams.get('entity') ?? undefined,
    from: request.nextUrl.searchParams.get('from') ?? undefined,
    to: request.nextUrl.searchParams.get('to') ?? undefined,
    onlyErrors: onlyErrorsParam === '1' || onlyErrorsParam === 'true',
    billingOnly: billingOnlyParam === '1' || billingOnlyParam === 'true',
    limit: Number(request.nextUrl.searchParams.get('limit') ?? 1000),
    cursor: null,
  });

  const formatParsed = formatSchema.safeParse(
    request.nextUrl.searchParams.get('format') ?? 'csv',
  );

  if (!parsed.success || !formatParsed.success) {
    return new Response('Ogiltiga audit-logg-filter', { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const result = await listAuditLog(supabaseAdmin, parsed.data);
  const format = formatParsed.data;

  if (format === 'json') {
    return new Response(JSON.stringify({ entries: result.entries }, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="audit-log.json"',
        'Cache-Control': 'private, no-cache',
      },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          'created_at,action,entity_type,entity_id,entity_label,actor_email,actor_role,metadata\n',
        ),
      );

      for (const entry of result.entries) {
        const row = [
          escapeCsv(entry.created_at),
          escapeCsv(entry.action),
          escapeCsv(entry.entity_type),
          escapeCsv(entry.entity_id),
          escapeCsv(entry.entity_label),
          escapeCsv(entry.actor_email),
          escapeCsv(entry.actor_role),
          escapeCsv(formatAuditMetadata(entry)),
        ].join(',');
        controller.enqueue(encoder.encode(`${row}\n`));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="audit-log.csv"',
      'Cache-Control': 'private, no-cache',
    },
  });
}, ['admin']);
