import { NextRequest } from 'next/server';
import { recordAdminAction } from '@/lib/admin/audit';
import { revalidateAdminTeamViews } from '@/lib/admin/cache-tags';
import {
  ensureTeamMemberProfile,
  type TeamRole,
} from '@/lib/admin/team-members';
import { addTeamMemberInputSchema } from '@/lib/admin/schemas/team';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { getAppUrl } from '@/lib/url/public';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    requireScope(user, 'team.write');

    const parsed = addTeamMemberInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Ogiltig payload', 400);
    }

    const body = parsed.data;
    const supabaseAdmin = createSupabaseAdmin();

    const { data: existingMember } = await supabaseAdmin
      .from('team_members')
      .select('id, name')
      .ilike('email', body.email.trim())
      .maybeSingle();

    if (existingMember) {
      return jsonError(`E-postadressen används redan av ${existingMember.name}`, 409, {
        field: 'email',
        existingMemberId: existingMember.id,
      });
    }

    const commissionRate =
      body.role === 'content_manager' ? body.commission_rate : 0;

    const { data: member, error: insertError } = await supabaseAdmin
      .from('team_members')
      .insert({
        name: body.name.trim(),
        email: body.email.trim(),
        phone: body.phone?.trim() || null,
        region: body.city?.trim() || null,
        bio: body.bio?.trim() || null,
        avatar_url: body.avatar_url?.trim() || null,
        color: body.color,
        role: body.role,
        is_active: true,
        commission_rate: commissionRate,
      })
      .select('id, name, email, phone, role, is_active, commission_rate, avatar_url, color')
      .single();

    if (insertError || !member) {
      return jsonError(insertError?.message || 'Kunde inte skapa teammedlem', 500);
    }

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('email', body.email.trim())
      .maybeSingle();

    if (existingProfile?.id) {
      await ensureTeamMemberProfile({
        supabaseAdmin,
        memberId: member.id,
        userId: existingProfile.id,
        email: body.email.trim(),
        name: body.name.trim(),
        role: body.role as TeamRole,
      });
    }

    let warning: string | null = null;
    if (body.sendInvite) {
      requireScope(user, 'team.invite');

      const appUrl = getAppUrl();
      const { data: inviteData, error: inviteError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(body.email.trim(), {
          data: {
            isTeamMember: true,
            invited_as: 'team_member',
            role: body.role,
            name: body.name.trim(),
            team_member_id: member.id,
          },
          redirectTo: `${appUrl}/auth/callback?flow=team_invite`,
        });

      if (inviteError) {
        warning = `Teammedlem skapad men inbjudan misslyckades: ${inviteError.message}`;
      } else {
        await supabaseAdmin
          .from('team_members')
          .update({ invited_at: new Date().toISOString() })
          .eq('id', member.id);

        if (inviteData.user?.id) {
          await ensureTeamMemberProfile({
            supabaseAdmin,
            memberId: member.id,
            userId: inviteData.user.id,
            email: body.email.trim(),
            name: body.name.trim(),
            role: body.role as TeamRole,
          });
        }
      }
    }

    await recordAdminAction(supabaseAdmin, {
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'team.create',
      entityType: 'team_member',
      entityId: member.id,
      metadata: {
        invited: body.sendInvite,
        warning,
      },
      afterState: {
        ...member,
        commission_rate: commissionRate,
      },
    });

    revalidateAdminTeamViews();

    return jsonOk({
      member,
      invited: body.sendInvite && !warning,
      warning,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte skapa teammedlem',
      500,
    );
  }
}, ['admin']);
