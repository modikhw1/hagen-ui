import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { resolveTeamMemberIdForProfile } from '@/lib/interactions';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { z } from 'zod';

const resolveSchema = z.object({
  resolution_note: z.string().trim().max(1000).optional().nullable(),
}).strict();

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth(async (request: NextRequest, user, { params }: RouteParams) => {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = resolveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Ogiltig payload' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const adminTeamMemberId = await resolveTeamMemberIdForProfile(user.id, supabase);
  if (!adminTeamMemberId) {
    return NextResponse.json({ error: 'Admin team member not found' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('cm_notifications')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by_admin_id: adminTeamMemberId,
      resolution_note: parsed.data.resolution_note ?? null,
    })
    .eq('id', id)
    .is('resolved_at', null)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notification: data });
}, ['admin']);
