import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createCmAbsence, listEnrichedCmAbsences } from '@/lib/admin/cm-absences';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const createAbsenceSchema = z.object({
  cm_id: z.string().uuid(),
  backup_cm_id: z.string().uuid().optional().nullable(),
  absence_type: z.enum(['vacation', 'sick', 'parental_leave', 'training', 'temporary_coverage', 'other']),
  compensation_mode: z.enum(['covering_cm', 'primary_cm']).default('covering_cm'),
  starts_on: z.string().trim().min(1),
  ends_on: z.string().trim().min(1),
  note: z.string().trim().max(1000).optional().nullable(),
}).strict();

export const GET = withAuth(async () => {
  const supabaseAdmin = createSupabaseAdmin();
  const absences = await listEnrichedCmAbsences(supabaseAdmin, { limit: 200 });
  return jsonOk({ absences });
}, ['admin']);

export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    const body = await request.json();
    const parsed = createAbsenceSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Ogiltig franvaro-payload', 400);
    }

    const supabaseAdmin = createSupabaseAdmin();
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

    return jsonOk({ absence }, 201);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte skapa franvaro',
      500,
    );
  }
}, ['admin']);
