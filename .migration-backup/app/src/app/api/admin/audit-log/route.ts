import { withAuth, requireScope } from '@/lib/auth/api-auth';
import { listAuditLog } from '@/lib/admin/audit-log';
import { auditLogFilterSchema } from '@/lib/admin/schemas/audit';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

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
    limit: Number(request.nextUrl.searchParams.get('limit') ?? 50),
    cursor: request.nextUrl.searchParams.get('cursor') ?? null,
  });

  if (!parsed.success) {
    return jsonError('Ogiltiga audit-logg-filter', 400);
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const result = await listAuditLog(supabaseAdmin, parsed.data);
    const nextCursor =
      result.entries.length === parsed.data.limit
        ? `${result.entries[result.entries.length - 1]?.created_at}|${result.entries[result.entries.length - 1]?.id}`
        : null;
    const facets = {
      actors: Array.from(
        new Set(result.entries.map((entry) => entry.actor_email).filter(Boolean)),
      ) as string[],
      actions: Array.from(new Set(result.entries.map((entry) => entry.action))),
      entities: Array.from(new Set(result.entries.map((entry) => entry.entity_type))),
    };
    const response = jsonOk({
      entries: result.entries,
      nextCursor,
      viewer: {
        email: user.email ?? null,
      },
      facets,
      schemaWarnings: result.schemaWarnings,
    });
    response.headers.set('Cache-Control', 'private, no-cache');
    return response;
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte hamta audit-loggen',
      500,
    );
  }
}, ['admin']);
