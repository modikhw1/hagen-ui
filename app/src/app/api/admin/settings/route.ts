import { z } from 'zod';
import { withAuth } from '@/lib/auth/api-auth';
import {
  getAdminSettings,
  SettingsStorageUnavailableError,
  updateAdminSettings,
} from '@/lib/admin/settings';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { recordAuditLog } from '@/lib/admin/audit-log';

const settingsSchema = z.object({
  default_billing_interval: z.enum(['month', 'quarter', 'year']).optional(),
  default_payment_terms_days: z.number().int().min(1).max(90).optional(),
  default_currency: z.string().trim().min(3).max(8).optional(),
  default_commission_rate: z.number().min(0).max(1).optional(),
}).strict();

export const GET = withAuth(async () => {
  const supabaseAdmin = createSupabaseAdmin();
  const result = await getAdminSettings(supabaseAdmin);
  return jsonOk(result);
}, ['admin']);

export const PATCH = withAuth(async (request, user) => {
  const parsed = settingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return jsonError('Ogiltig settings-payload', 400, {
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const before = await getAdminSettings(supabaseAdmin);

  try {
    const after = await updateAdminSettings(supabaseAdmin, parsed.data);
    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.settings.updated',
      entityType: 'settings',
      entityId: 'global',
      beforeState: before.settings,
      afterState: after.settings,
    });

    return jsonOk(after);
  } catch (error) {
    if (error instanceof SettingsStorageUnavailableError) {
      return jsonError(error.message, 409);
    }

    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte uppdatera settings',
      500,
    );
  }
}, ['admin']);

