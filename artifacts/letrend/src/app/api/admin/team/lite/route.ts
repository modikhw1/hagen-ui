import { NextRequest } from 'next/server';
import { fetchTeamMembersLite } from '@/lib/admin/team-members';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(async (request: NextRequest, user) => {
  try {
    requireScope(user, 'team.read');

    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === '1';
    const roleParam = request.nextUrl.searchParams.get('role');
    const role =
      roleParam === 'admin' || roleParam === 'content_manager' ? roleParam : undefined;
    const result = await fetchTeamMembersLite({
      supabaseAdmin: createSupabaseAdmin(),
      includeInactive,
      role,
    });

    return jsonOk({ members: result.members });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte hämta teammedlemmar',
      500,
    );
  }
});
