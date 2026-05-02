import { z } from 'zod';
import { recordAdminAction } from '@/lib/admin/audit';
import { revalidateAdminTeamViews } from '@/lib/admin/cache-tags';
import { rescheduleScheduledAssignmentChange } from '@/lib/admin/cm-assignments';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const bodySchema = z.object({
  customer_id: z.string().min(1),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = withAuth(async (request, user) => {
  try {
    requireScope(user, 'team.write');
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return jsonError('Ogiltig payload för reschedule handover', 400);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const updated = await rescheduleScheduledAssignmentChange({
      supabaseAdmin,
      customerProfileId: parsed.data.customer_id,
      effectiveDate: parsed.data.effective_date,
    });

    if (!updated) {
      return jsonError('Ingen schemalagd handover hittades för kunden', 404);
    }

    await recordAdminAction(supabaseAdmin, {
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'team.handover.reschedule',
      entityType: 'customer',
      entityId: parsed.data.customer_id,
      metadata: { effective_date: parsed.data.effective_date },
    }).catch(() => undefined);

    revalidateAdminTeamViews();

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte tidigarelägga handover',
      500,
    );
  }
}, ['admin']);
