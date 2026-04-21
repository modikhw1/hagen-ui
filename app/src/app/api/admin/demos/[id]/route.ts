import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const updateDemoSchema = z.object({
  status: z.enum(['draft', 'sent', 'opened', 'responded', 'won', 'lost', 'expired']),
  lost_reason: z.string().trim().max(1000).optional().nullable(),
}).strict();

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = withAuth(async (request: NextRequest, _user, { params }: RouteParams) => {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateDemoSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Ogiltig payload' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdmin();
  const { data: existingDemo, error: existingDemoError } = await supabase
    .from('demos')
    .select('id, status, responded_at, resolved_at, lost_reason')
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

  const { data: demo, error } = await supabase
    .from('demos')
    .update({
      status: nextStatus,
      status_changed_at: now,
      responded_at: responded ? (existingDemo.responded_at ?? now) : null,
      resolved_at: resolved ? now : null,
      lost_reason: nextStatus === 'lost' ? (parsed.data.lost_reason ?? existingDemo.lost_reason ?? null) : null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ demo });
}, ['admin']);
