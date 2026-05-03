import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import {
  createCmAbsence,
  type CmAbsenceType,
  type CompensationMode,
} from '@/lib/admin/cm-absences';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import {
  actionFailure,
  actionSuccess,
  buildCustomerActionAuditMetadata,
} from './shared';
import type { ActionResult, AdminActionContext } from './types';

type TemporaryCoverageInput = Extract<
  CustomerAction,
  { action: 'set_temporary_coverage' }
>;

export async function handleSetTemporaryCoverage(
  ctx: AdminActionContext,
  input: TemporaryCoverageInput,
): Promise<ActionResult> {
  if (!ctx.beforeProfile) {
    return actionFailure({ error: SERVER_COPY.customerNotFound, statusCode: 404 });
  }

  const currentAssignment = await ctx.supabaseAdmin
    .from('cm_assignments')
    .select('cm_id')
    .eq('customer_id', ctx.id)
    .is('valid_to', null)
    .maybeSingle();

  if (currentAssignment.error) {
    return actionFailure({
      error: currentAssignment.error.message || 'Kunde inte läsa CM-assignment',
      statusCode: 500,
    });
  }

  if (!currentAssignment.data?.cm_id) {
    return actionFailure({
      error: 'Kunden saknar ordinarie CM och kan inte temp-täckas',
      statusCode: 400,
    });
  }
  if (currentAssignment.data.cm_id === input.covering_cm_id) {
    return actionFailure({
      error: 'Ersättare måste vara en annan CM än kundens ordinarie CM',
      statusCode: 422,
    });
  }

  const absence = await createCmAbsence(ctx.supabaseAdmin, {
    cmId: currentAssignment.data.cm_id,
    customerProfileId: ctx.id,
    backupCmId: input.covering_cm_id,
    absenceType: 'temporary_coverage' satisfies CmAbsenceType,
    compensationMode: input.compensation_mode satisfies CompensationMode,
    startsOn: input.starts_on,
    endsOn: input.ends_on,
    note: input.note ?? null,
    createdBy: ctx.user.id,
  });

  await recordAuditLog(ctx.supabaseAdmin, {
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    actorRole: ctx.user.role,
    action: 'admin.customer.temporary_coverage_created',
    entityType: 'cm_absence',
    entityId: absence.id,
    beforeState: null,
    afterState: absence as unknown as Record<string, unknown>,
    metadata: buildCustomerActionAuditMetadata(ctx),
  });

  return actionSuccess({ absence });
}
