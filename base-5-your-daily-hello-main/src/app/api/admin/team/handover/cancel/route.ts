import { z } from 'zod';
import { recordAdminAction } from '@/lib/admin/audit';
import { cancelScheduledAssignmentChange } from '@/lib/admin/cm-assignments';
import { revalidateAdminTeamViews } from '@/lib/admin/cache-tags';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const bodySchema = z.object({
  customer_id: z.string().min(1),
});

export const POST = withAuth(async (request, user) => {
  try {
    requireScope(user, 'team.write');
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return jsonError('Ogiltig payload för cancel handover', 400);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const cancelled = await cancelScheduledAssignmentChange({
      supabaseAdmin,
      customerProfileId: parsed.data.customer_id,
    });

    if (!cancelled) {
      return jsonError('Ingen schemalagd handover hittades för kunden', 404);
    }

    await recordAdminAction(supabaseAdmin, {
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'team.handover.cancel',
      entityType: 'customer',
      entityId: parsed.data.customer_id,
    }).catch(() => undefined);

    revalidateAdminTeamViews();

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte avbryta handover',
      500,
    );
  }
}, ['admin']);
