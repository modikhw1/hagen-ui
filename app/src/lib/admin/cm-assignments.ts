import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, formatDateOnly, parseDateOnly } from '@/lib/admin/billing-periods';
import { isMissingRelationError } from '@/lib/admin/schema-guards';

type CustomerAssignmentSource = {
  id: string;
  business_name: string | null;
  account_manager_profile_id: string | null;
  account_manager: string | null;
};

type TeamMemberLookup = {
  id: string;
  name: string | null;
  email?: string | null;
  profile_id: string | null;
};

type ScheduledChangePayload = {
  next_cm_id: string | null;
  next_cm_name: string | null;
  next_cm_email: string | null;
  effective_date: string;
  handover_note: string | null;
  scheduled_at: string;
};

type AssignmentRecord = {
  id: string;
  customer_id: string;
  cm_id: string | null;
  valid_from: string;
  valid_to: string | null;
  handover_note: string | null;
  scheduled_change: ScheduledChangePayload | null;
};

export type ScheduledAssignmentChange = {
  customer_id: string;
  customer_name: string;
  current_cm_id: string | null;
  current_cm_name: string | null;
  next_cm_id: string | null;
  next_cm_name: string | null;
  next_cm_email: string | null;
  effective_date: string;
  handover_note: string | null;
};

export async function syncCustomerAssignmentFromProfile(params: {
  supabaseAdmin: SupabaseClient;
  customerProfileId: string;
  handoverNote?: string | null;
}) {
  const { supabaseAdmin, customerProfileId, handoverNote } = params;
  const today = formatDateOnly(new Date());

  const { data: customer, error: customerError } = await supabaseAdmin
    .from('customer_profiles')
    .select('id, business_name, account_manager_profile_id, account_manager')
    .eq('id', customerProfileId)
    .maybeSingle();

  if (customerError || !customer) {
    throw new Error(customerError?.message || 'Kunden kunde inte lasas');
  }

  const teamMember = await findAssignedTeamMember(
    supabaseAdmin,
    customer as CustomerAssignmentSource,
  );
  const activeAssignment = await readActiveAssignment(supabaseAdmin, customerProfileId);

  if (!teamMember) {
    if (activeAssignment) {
      await updateAssignment(
        supabaseAdmin,
        activeAssignment.id,
        {
          valid_to: formatDateOnly(addDays(parseDateOnly(today), -1)),
          scheduled_change: null,
          handover_note: handoverNote ?? 'Assignment removed from customer profile.',
        },
      );
    }
    return { status: 'cleared' as const };
  }

  if (activeAssignment?.cm_id === teamMember.id) {
    return { status: 'unchanged' as const, cmId: teamMember.id };
  }

  if (activeAssignment) {
    await updateAssignment(
      supabaseAdmin,
      activeAssignment.id,
      {
        valid_to: formatDateOnly(addDays(parseDateOnly(today), -1)),
        scheduled_change: null,
        handover_note: handoverNote ?? `Reassigned from ${customer.business_name || customer.id}.`,
      },
    );
  }

  await insertAssignment(supabaseAdmin, {
    customer_id: customerProfileId,
    cm_id: teamMember.id,
    valid_from: today,
    valid_to: null,
    handover_note: handoverNote ?? null,
    scheduled_change: null,
  });

  return { status: 'updated' as const, cmId: teamMember.id };
}

export async function changeCustomerAssignment(params: {
  supabaseAdmin: SupabaseClient;
  customerProfileId: string;
  nextCmId: string | null;
  effectiveDate: string;
  handoverNote?: string | null;
}) {
  const today = formatDateOnly(new Date());
  const effectiveDate = params.effectiveDate < today ? today : params.effectiveDate;
  const activeAssignment = await readActiveAssignment(params.supabaseAdmin, params.customerProfileId);
  const nextMember = params.nextCmId
    ? await resolveTeamMemberById(params.supabaseAdmin, params.nextCmId)
    : null;

  if (activeAssignment?.cm_id === (nextMember?.id ?? null)) {
    if (effectiveDate <= today) {
      return {
        status: 'applied' as const,
        effectiveDate,
        nextCmId: nextMember?.id ?? null,
      };
    }

    await updateAssignment(params.supabaseAdmin, activeAssignment.id, {
      scheduled_change: null,
    });
    return {
      status: 'scheduled' as const,
      effectiveDate,
      nextCmId: nextMember?.id ?? null,
    };
  }

  if (effectiveDate <= today) {
    if (activeAssignment) {
      await updateAssignment(params.supabaseAdmin, activeAssignment.id, {
        valid_to: formatDateOnly(addDays(parseDateOnly(effectiveDate), -1)),
        scheduled_change: null,
        handover_note: params.handoverNote ?? activeAssignment.handover_note,
      });
    }

    if (nextMember) {
      await insertAssignment(params.supabaseAdmin, {
        customer_id: params.customerProfileId,
        cm_id: nextMember.id,
        valid_from: effectiveDate,
        valid_to: null,
        handover_note: params.handoverNote ?? null,
        scheduled_change: null,
      });
    }

    await updateCustomerProfileAssignment(
      params.supabaseAdmin,
      params.customerProfileId,
      nextMember,
    );

    return {
      status: 'applied' as const,
      effectiveDate,
      nextCmId: nextMember?.id ?? null,
    };
  }

  if (!activeAssignment) {
    throw new Error('Kunden saknar aktiv CM-assignment att schemalagga fran');
  }

  await updateAssignment(params.supabaseAdmin, activeAssignment.id, {
    scheduled_change: {
      next_cm_id: nextMember?.id ?? null,
      next_cm_name: nextMember?.name ?? null,
      next_cm_email: nextMember?.email ?? null,
      effective_date: effectiveDate,
      handover_note: params.handoverNote ?? null,
      scheduled_at: new Date().toISOString(),
    },
  });

  return {
    status: 'scheduled' as const,
    effectiveDate,
    nextCmId: nextMember?.id ?? null,
  };
}

export async function applyScheduledAssignmentChanges(params: {
  supabaseAdmin: SupabaseClient;
  asOfDate?: string;
}) {
  const asOfDate = params.asOfDate ?? formatDateOnly(new Date());
  const scheduled = await listScheduledAssignmentChanges(params.supabaseAdmin);
  const applied: ScheduledAssignmentChange[] = [];

  for (const change of scheduled) {
    if (change.effective_date > asOfDate) {
      continue;
    }

    const activeAssignment = await readActiveAssignment(
      params.supabaseAdmin,
      change.customer_id,
    );

    if (!activeAssignment?.scheduled_change) {
      continue;
    }

    await updateAssignment(params.supabaseAdmin, activeAssignment.id, {
      valid_to: formatDateOnly(addDays(parseDateOnly(change.effective_date), -1)),
      scheduled_change: null,
      handover_note: change.handover_note ?? activeAssignment.handover_note,
    });

    const nextMember = change.next_cm_id
      ? await resolveTeamMemberById(params.supabaseAdmin, change.next_cm_id)
      : null;

    if (nextMember) {
      await insertAssignment(params.supabaseAdmin, {
        customer_id: change.customer_id,
        cm_id: nextMember.id,
        valid_from: change.effective_date,
        valid_to: null,
        handover_note: change.handover_note ?? null,
        scheduled_change: null,
      });
    }

    await updateCustomerProfileAssignment(
      params.supabaseAdmin,
      change.customer_id,
      nextMember,
    );

    applied.push(change);
  }

  return {
    scanned: scheduled.length,
    applied,
  };
}

export async function listScheduledAssignmentChanges(
  supabaseAdmin: SupabaseClient,
): Promise<ScheduledAssignmentChange[]> {
  const result = await (((supabaseAdmin.from('cm_assignments' as never) as never) as {
    select: (columns: string) => {
      is: (column: string, value: null) => {
        not: (innerColumn: string, operator: string, value: null) => Promise<{
          data: AssignmentRecord[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
  }).select(
    'id, customer_id, cm_id, valid_from, valid_to, handover_note, scheduled_change',
  )).is('valid_to', null).not('scheduled_change', 'is', null);

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return [];
    }

    throw new Error(result.error.message || 'Kunde inte lasa schemalagda CM-byten');
  }

  const customerIds = Array.from(new Set((result.data ?? []).map((row) => row.customer_id)));
  const cmIds = Array.from(new Set((result.data ?? []).flatMap((row) => {
    const scheduled = row.scheduled_change;
    return [row.cm_id, scheduled?.next_cm_id].filter(Boolean) as string[];
  })));

  const [customersResult, teamResult] = await Promise.all([
    supabaseAdmin
      .from('customer_profiles')
      .select('id, business_name')
      .in('id', customerIds),
    supabaseAdmin
      .from('team_members')
      .select('id, name, email')
      .in('id', cmIds),
  ]);

  if (customersResult.error) {
    throw new Error(customersResult.error.message);
  }
  if (teamResult.error) {
    throw new Error(teamResult.error.message);
  }

  const customersById = new Map(
    (customersResult.data ?? []).map((row) => [row.id, row.business_name || 'Kund']),
  );
  const teamById = new Map(
    (teamResult.data ?? []).map((row) => [row.id, row]),
  );

  return (result.data ?? [])
    .map((row) => {
      const scheduled = row.scheduled_change;
      if (!scheduled?.effective_date) {
        return null;
      }

      const currentMember = row.cm_id ? teamById.get(row.cm_id) : null;
      const nextMember = scheduled.next_cm_id ? teamById.get(scheduled.next_cm_id) : null;

      return {
        customer_id: row.customer_id,
        customer_name: customersById.get(row.customer_id) || 'Kund',
        current_cm_id: row.cm_id,
        current_cm_name: currentMember?.name ?? null,
        next_cm_id: scheduled.next_cm_id ?? null,
        next_cm_name: scheduled.next_cm_name ?? nextMember?.name ?? null,
        next_cm_email: scheduled.next_cm_email ?? nextMember?.email ?? null,
        effective_date: scheduled.effective_date,
        handover_note: scheduled.handover_note ?? null,
      } satisfies ScheduledAssignmentChange;
    })
    .filter((row): row is ScheduledAssignmentChange => row !== null)
    .sort((left, right) => left.effective_date.localeCompare(right.effective_date));
}

async function findAssignedTeamMember(
  supabaseAdmin: SupabaseClient,
  customer: CustomerAssignmentSource,
): Promise<TeamMemberLookup | null> {
  if (customer.account_manager_profile_id) {
    const byProfile = await supabaseAdmin
      .from('team_members')
      .select('id, name, email, profile_id')
      .eq('profile_id', customer.account_manager_profile_id)
      .maybeSingle();

    if (!byProfile.error && byProfile.data) {
      return byProfile.data as TeamMemberLookup;
    }
  }

  if (!customer.account_manager?.trim()) return null;

  const byName = await (((supabaseAdmin.from('team_members' as never) as never) as {
    select: (columns: string) => {
      ilike: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: TeamMemberLookup | null;
          error: { message?: string } | null;
        }>;
      };
    };
  }).select('id, name, email, profile_id')).ilike('name', customer.account_manager.trim()).maybeSingle();

  if (byName.error) {
    throw new Error(byName.error.message || 'Kunde inte sla upp teammedlem');
  }

  return byName.data;
}

async function resolveTeamMemberById(
  supabaseAdmin: SupabaseClient,
  teamMemberId: string,
) {
  const result = await supabaseAdmin
    .from('team_members')
    .select('id, name, email, profile_id')
    .eq('id', teamMemberId)
    .maybeSingle();

  if (result.error || !result.data) {
    throw new Error(result.error?.message || 'Teammedlemmen kunde inte hittas');
  }

  return result.data as TeamMemberLookup;
}

async function readActiveAssignment(
  supabaseAdmin: SupabaseClient,
  customerProfileId: string,
): Promise<AssignmentRecord | null> {
  const result = await (((supabaseAdmin.from('cm_assignments' as never) as never) as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        is: (innerColumn: string, innerValue: null) => {
          order: (orderColumn: string, options: { ascending: boolean }) => {
            limit: (value: number) => Promise<{
              data: AssignmentRecord[] | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    };
  }).select(
    'id, customer_id, cm_id, valid_from, valid_to, handover_note, scheduled_change',
  )).eq('customer_id', customerProfileId).is('valid_to', null).order(
    'valid_from',
    { ascending: false },
  ).limit(1);

  if (result.error) {
    if (isMissingRelationError(result.error.message)) return null;
    throw new Error(result.error.message || 'Kunde inte lasa aktiv assignment');
  }

  return result.data?.[0] ?? null;
}

async function updateAssignment(
  supabaseAdmin: SupabaseClient,
  assignmentId: string,
  values: Record<string, unknown>,
) {
  const result = await (((supabaseAdmin.from('cm_assignments' as never) as never) as {
    update: (value: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
    };
  }).update(values)).eq('id', assignmentId);

  if (result.error) {
    if (isMissingRelationError(result.error.message)) return;
    throw new Error(result.error.message || 'Kunde inte uppdatera assignment');
  }
}

async function insertAssignment(
  supabaseAdmin: SupabaseClient,
  values: Record<string, unknown>,
) {
  const result = await (((supabaseAdmin.from('cm_assignments' as never) as never) as {
    insert: (value: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
  }).insert(values));

  if (result.error) {
    if (isMissingRelationError(result.error.message)) return;
    throw new Error(result.error.message || 'Kunde inte skapa assignment');
  }
}

async function updateCustomerProfileAssignment(
  supabaseAdmin: SupabaseClient,
  customerProfileId: string,
  teamMember: TeamMemberLookup | null,
) {
  const result = await supabaseAdmin
    .from('customer_profiles')
    .update({
      account_manager: teamMember?.email ?? teamMember?.name ?? null,
      account_manager_profile_id: teamMember?.profile_id ?? null,
    } as never)
    .eq('id', customerProfileId);

  if (result.error) {
    throw new Error(result.error.message || 'Kunde inte uppdatera kundens CM-koppling');
  }
}
