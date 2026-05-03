import { NextRequest } from 'next/server';
import { recordAdminAttentionSeenEvent } from '@/lib/admin/events';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth(async (_request: NextRequest, user, { params }: RouteParams) => {
  requireScope(user, 'overview.read');

  const { id } = await params;
  if (!id) {
    return jsonError('Notifikations-ID krävs', 400);
  }

  try {
    await recordAdminAttentionSeenEvent(createSupabaseAdmin(), {
      userId: user.id,
      surface: 'notifications',
    });
    return jsonOk({ ok: true, id });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte markera notifikationen som läst',
      500,
    );
  }
}, ['admin']);
