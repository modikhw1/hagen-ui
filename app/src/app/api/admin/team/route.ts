import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';
import { getAppUrl } from '@/lib/url/public';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TEAM_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export const POST = withAuth(async (request: NextRequest, user) => {
  if (!user.is_admin && user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 });
  }

  const body = await request.json();
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // --- Handle resend invite (2.3) ---
  if (body.resend) {
    const { team_member_id, email: resendEmail, name: resendName, role: resendRole = 'content_manager' } = body;
    if (!resendEmail?.trim() || !team_member_id) {
      return NextResponse.json({ error: 'email och team_member_id krävs' }, { status: 400 });
    }
    const appUrl = getAppUrl();
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      resendEmail.trim(),
      {
        data: {
          isTeamMember: true,
          invited_as: 'team_member',
          role: resendRole,
          name: resendName?.trim() || '',
          team_member_id,
        },
        redirectTo: `${appUrl}/auth/callback?flow=team_invite`,
      }
    );
    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }
    // Best-effort: save invited_at
    await supabaseAdmin
      .from('team_members')
      .update({ invited_at: new Date().toISOString() })
      .eq('id', team_member_id);
    return NextResponse.json({ resent: true });
  }

  const { name, email, phone, role = 'content_manager', sendInvite = false } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Namn krävs' }, { status: 400 });
  }

  if (!email?.trim()) {
    return NextResponse.json({ error: 'E-post är obligatoriskt' }, { status: 400 });
  }

  // Duplicate check: 409 if email already exists
  const { data: existingMember } = await supabaseAdmin
    .from('team_members')
    .select('id, name')
    .ilike('email', email.trim())
    .maybeSingle();

  if (existingMember) {
    return NextResponse.json(
      { error: `E-postadressen används redan av ${existingMember.name}` },
      { status: 409 }
    );
  }

  // Pick color based on current team size
  const { count } = await supabaseAdmin
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  const color = TEAM_COLORS[(count ?? 0) % TEAM_COLORS.length];

  // Insert team member
  const { data: member, error: insertError } = await supabaseAdmin
    .from('team_members')
    .insert({
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      role,
      color,
      is_active: true,
    })
    .select('id, name, email, role, color, is_active')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Auto-link profile_id if an auth account with this email already exists.
  // Best-effort: failure does not affect team member creation.
  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('email', email.trim())
    .maybeSingle();

  if (existingProfile?.id) {
    await supabaseAdmin
      .from('team_members')
      .update({ profile_id: existingProfile.id })
      .eq('id', member.id);
  }

  // Optionally send invite email
  if (sendInvite && email?.trim()) {
    const appUrl = getAppUrl();

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.trim(),
      {
        data: {
          isTeamMember: true,
          invited_as: 'team_member',  // 1.1: explicit key for callback detection
          role,
          name: name.trim(),
          team_member_id: member.id,
        },
        redirectTo: `${appUrl}/auth/callback?flow=team_invite`,  // 1.1: belt-and-suspenders
      }
    );

    if (inviteError) {
      // Team member was created — return partial success with warning
      return NextResponse.json({
        member,
        warning: `Teammedlem skapad men inbjudan misslyckades: ${inviteError.message}`,
      });
    }

    // Best-effort: save invited_at for status tracking (3.3)
    await supabaseAdmin
      .from('team_members')
      .update({ invited_at: new Date().toISOString() })
      .eq('id', member.id);

    return NextResponse.json({ member, invited: true });
  }

  return NextResponse.json({ member });
});
