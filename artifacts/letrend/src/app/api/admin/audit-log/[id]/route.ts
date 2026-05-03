import { getAuditLogEntryById } from '@/lib/admin/audit-log';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(async (_request, user, context) => {
  requireScope(user, 'audit.read');

  const routeContext = context as {
    params: Promise<{ id?: string }>;
  };
  const { id } = await routeContext.params;
  if (!id) {
    return jsonError('Ogiltigt audit-logg-id', 400);
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const entry = await getAuditLogEntryById(supabaseAdmin, id);
    if (!entry) {
      return jsonError('Audit-posten hittades inte', 404);
    }

    return jsonOk({ entry });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte hämta audit-post',
      500,
    );
  }
}, ['admin']);
