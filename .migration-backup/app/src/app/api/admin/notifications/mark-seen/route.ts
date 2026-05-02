import { NextRequest } from 'next/server';
import { recordAdminAttentionSeenEvent } from '@/lib/admin/events';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const POST = withAuth(async (request: NextRequest, user) => {
  requireScope(user, 'overview.read');

  const body = (await request.json().catch(() => ({}))) as {
    surface?: 'overview' | 'notifications';
  };

  try {
    await recordAdminAttentionSeenEvent(createSupabaseAdmin(), {
      userId: user.id,
      surface: body.surface === 'notifications' ? 'notifications' : 'overview',
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte uppdatera notifikationer',
      500,
    );
  }
}, ['admin']);
