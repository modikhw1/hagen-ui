import { z } from 'zod';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { getTeamMemberById, reassignCustomersForCm } from '@/lib/admin/team-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const bodySchema = z
  .object({
    targetCmId: z.string().uuid(),
    customerIds: z.union([z.literal('all'), z.array(z.string().uuid())]).optional(),
  })
  .strict();

export const POST = withAuth(async (request, user, { params }: RouteParams) => {
  requireScope(user, 'team.write');

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || 'Ogiltig payload', 400);
  }

  const supabaseAdmin = createSupabaseAdmin();
  const sourceMember = await getTeamMemberById(supabaseAdmin, id);
  if (!sourceMember) {
    return jsonError('Teammedlem hittades inte', 404);
  }

  const result = await reassignCustomersForCm({
    supabaseAdmin,
    sourceMember,
    targetCmId: parsed.data.targetCmId,
    customerIds: parsed.data.customerIds ?? 'all',
    actor: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  });

  return jsonOk({
    ok: true,
    targetCmId: result.targetMember.id,
    effectiveDate: result.effectiveDate,
    reassignedCount: result.moved.length,
    customers: result.moved,
  });
}, ['admin']);
