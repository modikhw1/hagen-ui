import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { endCmAbsence, getCmAbsenceById } from '@/lib/admin/cm-absences';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { revalidateAdminTeamViews } from '@/lib/admin/cache-tags';
import { requireScope } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ absenceId: string }>;
}

export const DELETE = withAuth(async (_request: NextRequest, user, { params }: RouteParams) => {
  try {
    requireScope(user, 'team.absences.write');

    const { absenceId } = await params;
    const supabaseAdmin = createSupabaseAdmin();
    const before = await getCmAbsenceById(supabaseAdmin, absenceId);
    if (!before) {
      return jsonError('Frånvaro hittades inte', 404);
    }

    const ended = await endCmAbsence(supabaseAdmin, absenceId);

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.team.absence_end',
      entityType: 'cm_absence',
      entityId: absenceId,
      beforeState: before as unknown as Record<string, unknown>,
      afterState: ended as unknown as Record<string, unknown>,
    });

    revalidateAdminTeamViews();

    return jsonOk({ success: true, absence: ended });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte avsluta frånvaro',
      500,
    );
  }
}, ['admin']);
