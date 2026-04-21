import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { deleteCmAbsence, listEnrichedCmAbsences } from '@/lib/admin/cm-absences';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ absenceId: string }>;
}

export const DELETE = withAuth(async (_request: NextRequest, user, { params }: RouteParams) => {
  try {
    const { absenceId } = await params;
    const supabaseAdmin = createSupabaseAdmin();
    const existing = await listEnrichedCmAbsences(supabaseAdmin, { limit: 200 });
    const absence = existing.find((entry) => entry.id === absenceId) ?? null;

    await deleteCmAbsence(supabaseAdmin, absenceId);

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.team.absence_deleted',
      entityType: 'cm_absence',
      entityId: absenceId,
      beforeState: absence as unknown as Record<string, unknown> | null,
      afterState: null,
    });

    return jsonOk({ success: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte ta bort franvaro',
      500,
    );
  }
}, ['admin']);
