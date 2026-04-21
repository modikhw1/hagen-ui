import { withAuth } from '@/lib/auth/api-auth';
import { listAuditLog } from '@/lib/admin/audit-log';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(async (request) => {
  const limit = Math.max(
    10,
    Math.min(200, Number(request.nextUrl.searchParams.get('limit') ?? 100) || 100),
  );

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const result = await listAuditLog(supabaseAdmin, limit);
    return jsonOk(result);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte hamta audit-loggen',
      500,
    );
  }
}, ['admin']);

