import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminSettings } from '@/lib/admin/settings';
import { syncAdminAccessRole } from '@/lib/admin/admin-roles';
import type { Database } from '@/types/database';

export type TeamRole = Extract<
  Database['public']['Enums']['user_role'],
  'admin' | 'content_manager'
>;

export type TeamMemberRecord = {
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
const TEAM_MEMBER_LITE_SELECT = 'id, name, email, role, is_active, commission_rate, avatar_url';

export async function ensureTeamMemberProfile(params: {
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

  await supabaseAdmin.from('team_members').update({ profile_id: userId }).eq('id', memberId);
  await supabaseAdmin
    .from('user_roles')
    .upsert({ user_id: userId, role }, { onConflict: 'user_id,role' });

  await syncAdminAccessRole({
    supabaseAdmin,
    userId,
    shouldHaveAdminAccess: isAdmin,
  });
}

export async function fetchTeamMembers(params: {
  supabaseAdmin: SupabaseClient<Database>;
  includeInactive: boolean;
}) {
  const { supabaseAdmin, includeInactive } = params;
  const settings = await getAdminSettings(supabaseAdmin);

  let query = supabaseAdmin.from('team_members').select(TEAM_MEMBER_SELECT).order('name');

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const primary = await query;
  if (primary.error) {
    throw new Error(primary.error.message);
  }

  return {
    members: (primary.data ?? []) as unknown as TeamListRow[],
    schemaWarnings: [...settings.schemaWarnings] as string[],
    defaultCommissionRate: settings.settings.default_commission_rate,
  };
}

export async function fetchTeamMembersLite(params: {
  supabaseAdmin: SupabaseClient<Database>;
  includeInactive: boolean;
  role?: 'admin' | 'content_manager';
}) {
  const { supabaseAdmin, includeInactive, role } = params;

  let query = supabaseAdmin
    .from('team_members')
    .select(TEAM_MEMBER_LITE_SELECT)
    .order('name');

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }
  if (role) {
    query = query.eq('role', role);
  }

  const result = await query;
  if (result.error) {
    throw new Error(result.error.message || 'Kunde inte läsa teammedlemmar');
  }

  return {
    members: (result.data ?? []) as unknown as TeamListRow[],
  };
}
