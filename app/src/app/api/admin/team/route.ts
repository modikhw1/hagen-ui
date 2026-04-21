import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminSettings } from '@/lib/admin/settings';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { syncAdminAccessRole } from '@/lib/admin/admin-roles';
import { isMissingColumnError } from '@/lib/admin/schema-guards';
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
  commission_rate?: number | null;
};

type TeamListRow = Record<string, unknown>;

const TEAM_MEMBER_SELECT =
  'id, name, email, phone, role, color, is_active, commission_rate, created_at, profile_id, avatar_url, bio, region, expertise, start_date, notes, invited_at';
const TEAM_MEMBER_SELECT_LEGACY =
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

  await syncAdminAccessRole({
    supabaseAdmin,
    userId,
    shouldHaveAdminAccess: isAdmin,
  });
}

async function fetchTeamMembers(params: {
  supabaseAdmin: SupabaseClient<Database>;
  includeInactive: boolean;
  defaultCommissionRate: number;
}) {
  const { supabaseAdmin, includeInactive, defaultCommissionRate } = params;

  let query = supabaseAdmin
    .from('team_members')
    .select(TEAM_MEMBER_SELECT)
    .order('name');

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const primary = await query;
  if (!primary.error) {
    return {
      members: (primary.data ?? []) as unknown as TeamListRow[],
      schemaWarnings: [] as string[],
    };
  }

  if (!isMissingColumnError(primary.error.message)) {
    throw new Error(primary.error.message);
  }

  const fallback = includeInactive
    ? await (((supabaseAdmin.from('team_members' as never) as never) as {
        select: (columns: string) => {
          order: (column: string) => Promise<{
            data: TeamListRow[] | null;
            error: { message?: string } | null;
          }>;
        };
      }).select(TEAM_MEMBER_SELECT_LEGACY)).order('name')
    : await (((supabaseAdmin.from('team_members' as never) as never) as {
        select: (columns: string) => {
          order: (column: string) => {
            eq: (innerColumn: string, innerValue: boolean) => Promise<{
              data: TeamListRow[] | null;
              error: { message?: string } | null;
            }>;
          };
        };
      }).select(TEAM_MEMBER_SELECT_LEGACY)).order('name').eq('is_active', true);

  if (fallback.error) {
    throw new Error(fallback.error.message || 'Kunde inte hamta teammedlemmar');
  }

  return {
    members: ((fallback.data ?? []) as unknown as TeamListRow[]).map((member) => ({
      ...member,
      commission_rate: defaultCommissionRate,
    })),
    schemaWarnings: ['Kolumnen team_members.commission_rate saknas i databasen. Standardkommission anvands som fallback.'],
  };
}

export const GET = withAuth(async (request: NextRequest, user) => {
  try {
    if (!user.is_admin && user.role !== 'admin') {
      return jsonError('Adminbehorighet kravs', 403);
    }

    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === '1';
    const supabaseAdmin = createSupabaseAdmin();
    const settings = await getAdminSettings(supabaseAdmin);
    const result = await fetchTeamMembers({
      supabaseAdmin,
      includeInactive,
      defaultCommissionRate: settings.settings.default_commission_rate,
    });

    return jsonOk({
      members: result.members,
      schemaWarnings: [...settings.schemaWarnings, ...result.schemaWarnings],
    });
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
    const settings = await getAdminSettings(supabaseAdmin);

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
        update: (value: Record<string, unknown>) => {
          eq: (column: string, value: string) => Promise<unknown>;
        };
      })
        .update({ invited_at: new Date().toISOString() })
        .eq('id', team_member_id);

      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'admin.team.invite_resent',
        entityType: 'team_member',
        entityId: String(team_member_id),
        metadata: {
          email: resendEmail.trim(),
          role: resendRole,
        },
      });

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
      commission_rate,
    } = body;

    if (!name?.trim()) {
      return jsonError('Namn kravs', 400);
    }

    if (!email?.trim()) {
      return jsonError('E-post ar obligatoriskt', 400);
    }

    const { data: existingMember } = await (supabaseAdmin.from('team_members') as never as {
      select: (columns: string) => {
        ilike: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: TeamMemberRecord | null }>;
        };
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
        options: { count: 'exact'; head: true },
      ) => {
        eq: (column: string, value: boolean) => Promise<{ count: number | null }>;
      };
    })
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    const color = TEAM_COLORS.includes(requestedColor)
      ? requestedColor
      : TEAM_COLORS[(count ?? 0) % TEAM_COLORS.length];
    const parsedCommissionRate = Number(commission_rate);
    const commissionRate =
      commission_rate !== undefined && commission_rate !== null
        ? Math.max(0, Math.min(1, Number.isFinite(parsedCommissionRate) ? parsedCommissionRate : 0))
        : settings.settings.default_commission_rate;

    const insertWithCommission = await (supabaseAdmin.from('team_members') as never as {
      insert: (value: Record<string, unknown>) => {
        select: (columns: string) => {
          single: () => Promise<{
            data: TeamMemberRecord | null;
            error: { message?: string } | null;
          }>;
        };
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
        commission_rate: commissionRate,
      })
      .select('id, name, email, phone, role, color, is_active, commission_rate')
      .single();

    let member = insertWithCommission.data;
    let insertError = insertWithCommission.error;

    if (insertError && isMissingColumnError(insertError.message)) {
      const legacyInsert = await (supabaseAdmin.from('team_members') as never as {
        insert: (value: Record<string, unknown>) => {
          select: (columns: string) => {
            single: () => Promise<{
              data: TeamMemberRecord | null;
              error: { message?: string } | null;
            }>;
          };
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

      member = legacyInsert.data
        ? ({ ...legacyInsert.data, commission_rate: commissionRate } as TeamMemberRecord)
        : legacyInsert.data;
      insertError = legacyInsert.error;
    }

    if (insertError || !member) {
      return jsonError(insertError?.message || 'Kunde inte skapa teammedlem', 500);
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
        update: (value: Record<string, unknown>) => {
          eq: (column: string, value: string) => Promise<unknown>;
        };
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

      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'admin.team.created',
        entityType: 'team_member',
        entityId: member.id,
        afterState: {
          ...member,
          commission_rate: commissionRate,
        },
        metadata: {
          invited: true,
        },
      });

      return jsonOk({ member, invited: true });
    }

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.team.created',
      entityType: 'team_member',
      entityId: member.id,
      afterState: {
        ...member,
        commission_rate: commissionRate,
      },
      metadata: {
        invited: false,
      },
    });

    return jsonOk({ member });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte skapa teammedlem',
      500,
    );
  }
});
