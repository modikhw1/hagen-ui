import { NextRequest, NextResponse } from 'next/server';
import { recordAdminAction } from '@/lib/admin/audit';
import { updateDemoStatusInputSchema } from '@/lib/admin/schemas/demos';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = withAuth(async (request: NextRequest, user, { params }: RouteParams) => {
  requireScope(user, 'demos.write');

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateDemoStatusInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Ogiltig payload' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdmin();
  const { data: existingDemo, error: existingDemoError } = await supabase
    .from('demos')
    .select('id, status, sent_at, opened_at, responded_at, resolved_at, lost_reason')
    .eq('id', id)
    .maybeSingle();

  if (existingDemoError) {
    return NextResponse.json({ error: existingDemoError.message }, { status: 500 });
  }

  if (!existingDemo) {
    return NextResponse.json({ error: 'Demo hittades inte' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const nextStatus = parsed.data.status;
  const resolved = nextStatus === 'won' || nextStatus === 'lost' || nextStatus === 'expired';
  const responded = nextStatus === 'responded' || nextStatus === 'won' || nextStatus === 'lost';
  const opened = nextStatus === 'opened' || responded || resolved;
  const sent = nextStatus === 'sent' || opened;

  const { data: demo, error } = await supabase
    .from('demos')
    .update({
      status: nextStatus,
      status_changed_at: now,
      sent_at: sent ? (existingDemo.sent_at ?? now) : null,
      opened_at: opened ? (existingDemo.opened_at ?? now) : null,
      responded_at: responded ? (existingDemo.responded_at ?? now) : null,
      resolved_at: resolved ? now : null,
      lost_reason:
        nextStatus === 'lost'
          ? (parsed.data.lost_reason ?? existingDemo.lost_reason ?? null)
          : null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAdminAction(supabase, {
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'demo.status_change',
    entityType: 'demo',
    entityId: id,
    metadata: {
      from: existingDemo.status,
      to: nextStatus,
    },
    beforeState: existingDemo as Record<string, unknown>,
    afterState: demo as Record<string, unknown>,
  });

  return NextResponse.json({ demo });
}, ['admin', 'content_manager']);
