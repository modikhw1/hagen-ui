import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TEAM_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export const POST = withAuth(async (request: NextRequest, user) => {
  if (!user.is_admin && user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 });
  }

  const body = await request.json();
  const { name, email, phone, role = 'content_manager', sendInvite = false } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Namn krävs' }, { status: 400 });
  }

  if (!email?.trim()) {
    return NextResponse.json({ error: 'E-post är obligatoriskt' }, { status: 400 });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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

  // Optionally send invite email
  if (sendInvite && email?.trim()) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.trim(),
      {
        data: {
          isTeamMember: true,
          role,
          name: name.trim(),
          team_member_id: member.id,
        },
        redirectTo: `${appUrl}/auth/callback`,
      }
    );

    if (inviteError) {
      // Team member was created — return partial success with warning
      return NextResponse.json({
        member,
        warning: `Teammedlem skapad men inbjudan misslyckades: ${inviteError.message}`,
      });
    }

    return NextResponse.json({ member, invited: true });
  }

  return NextResponse.json({ member });
});
