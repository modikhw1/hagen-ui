import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDateOnly } from '@/lib/admin/billing-periods';

export type TeamMemberServerRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  color: string | null;
  is_active: boolean | null;
  commission_rate?: number | null;
  created_at?: string | null;
  profile_id: string | null;
  avatar_url: string | null;
  bio: string | null;
  region: string | null;
  expertise?: unknown;
  start_date?: string | null;
  notes?: string | null;
  invited_at?: string | null;
};

type CustomerAssignmentRow = {
  id: string;
  business_name: string | null;
  account_manager_profile_id: string | null;
  account_manager: string | null;
  status: string | null;
};

type ActiveAssignmentRow = {
  customer_id: string;
};

type AuthActor = {
  id: string;
  email: string | null;
  role: string | null;
};

export type TeamReassignmentResult = {
  targetMember: TeamMemberServerRecord;
  effectiveDate: string;
  moved: Array<{ customerId: string; customerName: string | null }>;
};

type TeamMemberUpdateResult = {
  member: TeamMemberServerRecord;
  assignmentResult: TeamReassignmentResult | null;
};

export async function getTeamMemberById(
  supabaseAdmin: SupabaseClient,
  id: string,
): Promise<TeamMemberServerRecord | null> {
  const { data, error } = await (supabaseAdmin.from('team_members' as never) as never as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: TeamMemberServerRecord | null;
          error: { message?: string } | null;
        }>;
      };
    };
  })
    .select(
      'id, name, email, phone, role, color, is_active, commission_rate, created_at, profile_id, avatar_url, bio, region, expertise, start_date, notes, invited_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Kunde inte hämta teammedlem');
  }

  return data;
}

export async function listOwnedCustomersForCm(
  supabaseAdmin: SupabaseClient,
  member: Pick<TeamMemberServerRecord, 'id' | 'name' | 'email' | 'profile_id'>,
) {
  const activeAssignmentsResult = await (((supabaseAdmin.from('cm_assignments' as never) as never) as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        is: (innerColumn: string, innerValue: null) => Promise<{
          data: ActiveAssignmentRow[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
  }).select('customer_id')).eq('cm_id', member.id).is('valid_to', null);

  if (activeAssignmentsResult.error) {
    throw new Error(activeAssignmentsResult.error.message || 'Kunde inte läsa kundansvar');
  }

  const customerIds = (activeAssignmentsResult.data ?? []).map((row) => row.customer_id);
  if (customerIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('customer_profiles')
    .select('id, business_name, account_manager_profile_id, account_manager, status')
    .in('id', customerIds)
    .neq('status', 'archived');

  if (error) {
    throw new Error(error.message || 'Kunde inte läsa kundansvar');
  }

  return (data ?? []) as CustomerAssignmentRow[];
}

export async function reassignCustomersForCm(params: {
  supabaseAdmin: SupabaseClient;
  sourceMember: TeamMemberServerRecord;
  targetCmId: string;
  actor: AuthActor;
  customerIds?: string[] | 'all';
}): Promise<TeamReassignmentResult> {
  type ReassignCustomersRpcResult = {
    target_cm_id: string;
    effective_date: string;
    reassigned_count: number;
    customers: Array<{ customerId: string; customerName: string | null }>;
  };

  const { data, error } = await (params.supabaseAdmin.rpc(
    'admin_reassign_team_customers' as never,
    {
      p_source_cm_id: params.sourceMember.id,
      p_target_cm_id: params.targetCmId,
      p_customer_ids:
        params.customerIds === 'all' || params.customerIds === undefined
          ? null
          : params.customerIds,
      p_actor_user_id: params.actor.id,
      p_actor_email: params.actor.email,
      p_actor_role: params.actor.role,
    } as never,
  ) as unknown as Promise<{
    data: ReassignCustomersRpcResult | null;
    error: { message?: string } | null;
  }>);

  if (error) {
    throw new Error(error.message || 'Kunde inte omfördela kunder');
  }

  const targetMember = await getTeamMemberById(params.supabaseAdmin, params.targetCmId);
  if (!targetMember) {
    throw new Error('Vald ersättare hittades inte');
  }

  return {
    targetMember,
    effectiveDate: data?.effective_date ?? formatDateOnly(new Date()),
    moved: data?.customers ?? [],
  };
}

export async function updateTeamMemberTransaction(params: {
  supabaseAdmin: SupabaseClient;
  teamMemberId: string;
  profile?: {
    name?: string;
    email?: string;
    phone?: string | null;
    city?: string | null;
    bio?: string | null;
    avatar_url?: string;
  };
  commissionRate?: number;
  reassignToCmId?: string | null;
  actor: AuthActor;
}): Promise<TeamMemberUpdateResult> {
  type UpdateTeamMemberRpcResult = {
    member: TeamMemberServerRecord;
    assignment_result: {
      target_cm_id: string;
      effective_date: string;
      reassigned_count: number;
      customers: Array<{ customerId: string; customerName: string | null }>;
    } | null;
  };

  const { data, error } = await (params.supabaseAdmin.rpc(
    'admin_update_team_member' as never,
    {
      p_cm_id: params.teamMemberId,
      p_profile: params.profile ?? {},
      p_commission_rate: params.commissionRate ?? null,
      p_reassign_to_cm_id: params.reassignToCmId ?? null,
      p_actor_user_id: params.actor.id,
      p_actor_email: params.actor.email,
      p_actor_role: params.actor.role,
    } as never,
  ) as unknown as Promise<{
    data: UpdateTeamMemberRpcResult | null;
    error: { message?: string } | null;
  }>);

  if (error) {
    throw new Error(error.message || 'Kunde inte uppdatera teammedlem');
  }

  if (!data?.member) {
    throw new Error('Teammedlem hittades inte');
  }

  let assignmentResult: TeamReassignmentResult | null = null;
  if (data.assignment_result?.target_cm_id) {
    const targetMember = await getTeamMemberById(
      params.supabaseAdmin,
      data.assignment_result.target_cm_id,
    );

    if (!targetMember) {
      throw new Error('Vald ersättare hittades inte');
    }

    assignmentResult = {
      targetMember,
      effectiveDate: data.assignment_result.effective_date,
      moved: data.assignment_result.customers ?? [],
    };
  }

  return {
    member: data.member,
    assignmentResult,
  };
}
