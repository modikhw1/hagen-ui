import { withAuth, requireScope } from '@/lib/auth/api-auth';
import {
  getAdminSettings,
  SettingsStorageUnavailableError,
  updateAdminSettings,
} from '@/lib/admin/settings';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { recordAdminAction } from '@/lib/admin/audit';
import {
  adminSettingsResponseSchema,
  updateAdminSettingsInputSchema,
} from '@/lib/admin/schemas/settings';

export const GET = withAuth(async (_request, user) => {
  requireScope(user, 'settings.read');

  const supabaseAdmin = createSupabaseAdmin();
  const result = await getAdminSettings(supabaseAdmin);
  const response = jsonOk(adminSettingsResponseSchema.parse(result));
  response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
  return response;
}, ['admin']);

export const PATCH = withAuth(async (request, user) => {
  requireScope(user, 'settings.write');

  const parsed = updateAdminSettingsInputSchema.safeParse(await request.json().catch(() => null));
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
    const changedFields = Object.entries(after.settings).reduce<Record<string, unknown>>(
      (acc, [key, nextValue]) => {
        if (key === 'updated_at') {
          return acc;
        }

        const previousValue = before.settings[key as keyof typeof before.settings];
        if (previousValue !== nextValue) {
          acc[key] = {
            from: previousValue,
            to: nextValue,
          };
        }

        return acc;
      },
      {},
    );

    await recordAdminAction(supabaseAdmin, {
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.settings.updated',
      entityType: 'admin_settings',
      entityId: null,
      metadata: {
        changed_fields: changedFields,
        beforeState: before.settings as Record<string, unknown>,
        afterState: after.settings as Record<string, unknown>,
      },
    });

    const response = jsonOk(adminSettingsResponseSchema.parse(after));
    response.headers.set('Cache-Control', 'private, no-cache');
    return response;
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
