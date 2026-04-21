import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { resolveTeamMemberIdForProfile } from '@/lib/interactions';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { z } from 'zod';

const subjectTypeSchema = z.enum([
  'invoice',
  'onboarding',
  'cm_notification',
  'customer_blocking',
  'demo_response',
  'cm_assignment',
  'subscription_pause_resume',
  'cm_activity',
]);

const snoozeSchema = z.object({
  days: z.number().int().optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
}).strict();

interface RouteParams {
  params: Promise<{ subjectType: string; subjectId: string }>;
}

export const POST = withAuth(async (request: NextRequest, user, { params }: RouteParams) => {
  const { subjectType, subjectId } = await params;
  const parsedType = subjectTypeSchema.safeParse(subjectType);
  if (!parsedType.success) {
    return NextResponse.json({ error: 'Ogiltig subject_type' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsedBody = snoozeSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues[0]?.message || 'Ogiltig payload' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const adminTeamMemberId = await resolveTeamMemberIdForProfile(user.id, supabase);
  if (!adminTeamMemberId) {
    return NextResponse.json({ error: 'Admin team member not found' }, { status: 409 });
  }

  const snoozedUntil = parsedBody.data.days == null
    ? null
    : new Date(Date.now() + parsedBody.data.days * 86_400_000).toISOString();

  const { data: existing } = await supabase
    .from('attention_snoozes')
    .select('id')
    .eq('subject_type', parsedType.data)
    .eq('subject_id', subjectId)
    .is('released_at', null)
    .maybeSingle();

  const query = existing
    ? supabase
        .from('attention_snoozes')
        .update({
          snoozed_until: snoozedUntil,
          note: parsedBody.data.note ?? null,
          snoozed_by_admin_id: adminTeamMemberId,
          snoozed_at: new Date().toISOString(),
          released_at: null,
          release_reason: null,
        })
        .eq('id', existing.id)
    : supabase
        .from('attention_snoozes')
        .insert({
          subject_type: parsedType.data,
          subject_id: subjectId,
          snoozed_until: snoozedUntil,
          note: parsedBody.data.note ?? null,
          snoozed_by_admin_id: adminTeamMemberId,
        });

  const { data, error } = await query.select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ snooze: data }, { status: existing ? 200 : 201 });
}, ['admin']);

export const DELETE = withAuth(async (_request: NextRequest, user, { params }: RouteParams) => {
  const { subjectType, subjectId } = await params;
  const parsedType = subjectTypeSchema.safeParse(subjectType);
  if (!parsedType.success) {
    return NextResponse.json({ error: 'Ogiltig subject_type' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const adminTeamMemberId = await resolveTeamMemberIdForProfile(user.id, supabase);
  if (!adminTeamMemberId) {
    return NextResponse.json({ error: 'Admin team member not found' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('attention_snoozes')
    .update({
      released_at: new Date().toISOString(),
      release_reason: 'manual',
      snoozed_by_admin_id: adminTeamMemberId,
    })
    .eq('subject_type', parsedType.data)
    .eq('subject_id', subjectId)
    .is('released_at', null)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: data?.length ?? 0 });
}, ['admin']);
