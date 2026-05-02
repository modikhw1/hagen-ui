import { NextRequest } from 'next/server';
import { recordAdminAttentionSeenEvent } from '@/lib/admin/events';
import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const POST = withAuth(async (request: NextRequest, user) => {
  const body = (await request.json().catch(() => ({}))) as {
    surface?: 'overview' | 'notifications';
  };
  const surface = body.surface === 'notifications' ? 'notifications' : 'overview';

  try {
    await recordAdminAttentionSeenEvent(createSupabaseAdmin(), {
      userId: user.id,
      surface,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte spara attention-markering',
      500,
    );
  }

  return jsonOk({ ok: true });
}, ['admin']);
