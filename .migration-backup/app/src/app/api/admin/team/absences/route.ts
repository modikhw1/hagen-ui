import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createCmAbsence, listEnrichedCmAbsences } from '@/lib/admin/cm-absences';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { revalidateAdminTeamViews } from '@/lib/admin/cache-tags';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const createAbsenceSchema = z
  .object({
    cm_id: z.string().uuid(),
    backup_cm_id: z.string().uuid().nullable(),
    absence_type: z.enum(['vacation', 'sick', 'parental_leave', 'training', 'other']),
    compensation_mode: z.enum(['covering_cm', 'primary_cm']),
    starts_on: z.string().date(),
    ends_on: z.string().date(),
    note: z.string().max(500).nullable(),
  })
  .refine((data) => data.ends_on >= data.starts_on, 'ends_on får inte vara före starts_on')
  .refine(
    (data) => data.compensation_mode === 'primary_cm' || Boolean(data.backup_cm_id),
    'covering_cm kräver backup_cm_id',
  );

export const GET = withAuth(async (_request, user) => {
  requireScope(user, 'team.read');

  const supabaseAdmin = createSupabaseAdmin();
  const absences = await listEnrichedCmAbsences(supabaseAdmin, { limit: 200 });
  return jsonOk({ absences });
}, ['admin']);

export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    requireScope(user, 'team.absences.write');

    const body = await request.json();
    const parsed = createAbsenceSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Ogiltig frånvaro-payload', 422);
    }

    const supabaseAdmin = createSupabaseAdmin();
    if (parsed.data.backup_cm_id) {
      const { data: backupMember, error: backupError } = await supabaseAdmin
        .from('team_members')
        .select('id, is_active')
        .eq('id', parsed.data.backup_cm_id)
        .maybeSingle();

      if (backupError) {
        return jsonError(backupError.message || 'Kunde inte validera ersättare', 500);
      }

      if (!backupMember?.is_active) {
        return jsonError('backup_cm_id måste peka på en aktiv CM', 422);
      }
    }

    const absence = await createCmAbsence(supabaseAdmin, {
      cmId: parsed.data.cm_id,
      backupCmId: parsed.data.backup_cm_id ?? null,
      absenceType: parsed.data.absence_type,
      compensationMode: parsed.data.compensation_mode,
      startsOn: parsed.data.starts_on,
      endsOn: parsed.data.ends_on,
      note: parsed.data.note ?? null,
      createdBy: user.id,
    });

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.team.absence_created',
      entityType: 'cm_absence',
      entityId: absence.id,
      afterState: absence as unknown as Record<string, unknown>,
    });

    revalidateAdminTeamViews();

    return jsonOk(
      {
        absence,
        payrollImpact: {
          primaryCmEarnsDuringAbsence: parsed.data.compensation_mode === 'primary_cm',
          coveringCmEarns: parsed.data.compensation_mode === 'covering_cm',
        },
      },
      201,
    );
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('intervall')) {
      return jsonError(error.message, 409);
    }

    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte skapa frånvaro',
      500,
    );
  }
}, ['admin']);
