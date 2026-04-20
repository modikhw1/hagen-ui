import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';
import { getAppUrl } from '@/lib/url/public';
import type { Database } from '@/types/database';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const TEAM_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
type TeamRole = Extract<Database['public']['Enums']['user_role'], 'admin' | 'content_manager'>;
type TeamMemberRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  color: string | null;
  is_active: boolean | null;
};
const TEAM_MEMBER_SELECT =
  'id, name, email, phone, role, color, is_active, created_at, profile_id, avatar_url, bio, region, expertise, start_date, notes, invited_at';

async function ensureTeamMemberProfile(params: {
  supabaseAdmin: SupabaseClient<Database>;
  memberId: string;
  userId: string;
  email: string;
  name: string;
  role: TeamRole;
}) {
  const { supabaseAdmin, memberId, userId, email, name, role } = params;
  const isAdmin = role === 'admin';

  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, matching_data')
    .eq('id', userId)
    .maybeSingle();

  const matchingData =
    existingProfile?.matching_data &&
    typeof existingProfile.matching_data === 'object' &&
    !Array.isArray(existingProfile.matching_data)
      ? existingProfile.matching_data
      : {};

  if (existingProfile?.id) {
    await supabaseAdmin
      .from('profiles')
      .update({
        email,
        business_name: name,
        role,
        is_admin: isAdmin,
        matching_data: matchingData,
      })
      .eq('id', userId);
  } else {
    await supabaseAdmin.from('profiles').insert({
      id: userId,
      email,
      business_name: name,
      business_description: null,
      social_links: {},
      tone: [],
      energy: null,
      industry: null,
      matching_data: {},
      has_paid: false,
      has_concepts: false,
      is_admin: isAdmin,
      role,
    });
  }

  await supabaseAdmin
    .from('team_members')
    .update({ profile_id: userId })
    .eq('id', memberId);

  await supabaseAdmin
    .from('user_roles')
    .upsert({ user_id: userId, role }, { onConflict: 'user_id,role' });
}

export const GET = withAuth(async (request: NextRequest, user) => {
  try {
    if (!user.is_admin && user.role !== 'admin') {
      return jsonError('Adminbehorighet kravs', 403);
    }

    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === '1';
    const supabaseAdmin = createSupabaseAdmin();

    let query = supabaseAdmin
      .from('team_members')
      .select(TEAM_MEMBER_SELECT)
      .order('name');

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk({ members: data ?? [] });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte hamta teammedlemmar',
      500,
    );
  }
});

export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    if (!user.is_admin && user.role !== 'admin') {
      return jsonError('Adminbehorighet kravs', 403);
    }

    const body = await request.json();
    const supabaseAdmin = createSupabaseAdmin();

    if (body.resend) {
      const {
        team_member_id,
        email: resendEmail,
        name: resendName,
        role: resendRole = 'content_manager',
      } = body;

      if (!resendEmail?.trim() || !team_member_id) {
        return jsonError('email och team_member_id kravs', 400);
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
        },
      );

      if (inviteError) {
        return jsonError(inviteError.message, 500);
      }

      await (supabaseAdmin.from('team_members') as never as {
        update: (value: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<unknown> };
      })
        .update({ invited_at: new Date().toISOString() })
        .eq('id', team_member_id);

      return jsonOk({ resent: true });
    }

    const {
      name,
      email,
      phone,
      city,
      bio,
      avatar_url,
      color: requestedColor,
      role = 'content_manager' as TeamRole,
      sendInvite = false,
    } = body;

    if (!name?.trim()) {
      return jsonError('Namn kravs', 400);
    }

    if (!email?.trim()) {
      return jsonError('E-post ar obligatoriskt', 400);
    }

    const { data: existingMember } = await (supabaseAdmin.from('team_members') as never as {
      select: (columns: string) => {
        ilike: (column: string, value: string) => { maybeSingle: () => Promise<{ data: TeamMemberRecord | null }> };
      };
    })
      .select('id, name')
      .ilike('email', email.trim())
      .maybeSingle();

    if (existingMember) {
      return jsonError(`E-postadressen anvands redan av ${existingMember.name}`, 409);
    }

    const { count } = await (supabaseAdmin.from('team_members') as never as {
      select: (
        columns: string,
        options: { count: 'exact'; head: true }
      ) => { eq: (column: string, value: boolean) => Promise<{ count: number | null }> };
    })
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    const color = TEAM_COLORS.includes(requestedColor)
      ? requestedColor
      : TEAM_COLORS[(count ?? 0) % TEAM_COLORS.length];

    const { data: member, error: insertError } = await (supabaseAdmin.from('team_members') as never as {
      insert: (value: Record<string, unknown>) => {
        select: (columns: string) => { single: () => Promise<{ data: TeamMemberRecord; error: { message: string } | null }> };
      };
    })
      .insert({
        name: name.trim(),
        email: email.trim(),
        phone: phone?.trim() || null,
        region: city?.trim() || null,
        bio: bio?.trim() || null,
        avatar_url: avatar_url?.trim() || null,
        role,
        color,
        is_active: true,
      })
      .select('id, name, email, phone, role, color, is_active')
      .single();

    if (insertError) {
      return jsonError(insertError.message, 500);
    }

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('email', email.trim())
      .maybeSingle();

    if (existingProfile?.id) {
      await ensureTeamMemberProfile({
        supabaseAdmin,
        memberId: member.id,
        userId: existingProfile.id,
        email: email.trim(),
        name: name.trim(),
        role,
      });
    }

    if (sendInvite) {
      const appUrl = getAppUrl();
      const { data: inviteData, error: inviteError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(
          email.trim(),
          {
            data: {
              isTeamMember: true,
              invited_as: 'team_member',
              role,
              name: name.trim(),
              team_member_id: member.id,
            },
            redirectTo: `${appUrl}/auth/callback?flow=team_invite`,
          },
        );

      if (inviteError) {
        return jsonOk({
          member,
          warning: `Teammedlem skapad men inbjudan misslyckades: ${inviteError.message}`,
        });
      }

      await (supabaseAdmin.from('team_members') as never as {
        update: (value: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<unknown> };
      })
        .update({ invited_at: new Date().toISOString() })
        .eq('id', member.id);

      if (inviteData.user?.id) {
        await ensureTeamMemberProfile({
          supabaseAdmin,
          memberId: member.id,
          userId: inviteData.user.id,
          email: email.trim(),
          name: name.trim(),
          role,
        });
      }

      return jsonOk({ member, invited: true });
    }

    return jsonOk({ member });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte skapa teammedlem',
      500,
    );
  }
});
