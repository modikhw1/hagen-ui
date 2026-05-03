import { NextRequest } from 'next/server';

import { withAuth, requireScope } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { jsonError, jsonOk } from '@/lib/server/api-response';

type TeamMemberLite = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  is_active: boolean | null;
  commission_rate: number | null;
  avatar_url: string | null;
  region?: string | null;
  start_date?: string | null;
};

export const GET = withAuth(async (_request: NextRequest, user) => {
  try {
    requireScope(user, 'customers.write');

    const supabaseAdmin = createSupabaseAdmin();
    const [membersResult, assignmentsResult, absencesResult] = await Promise.all([
      supabaseAdmin
        .from('team_members' as never)
        .select(
          'id, name, email, role, is_active, commission_rate, avatar_url, region, start_date',
        )
        .in('role', ['content_manager', 'admin'])
        .eq('is_active', true)
        .order('name'),
      supabaseAdmin
        .from('cm_assignments')
        .select('customer_id, cm_id')
        .is('valid_to', null),
      supabaseAdmin
        .from('cm_absences')
        .select('cm_id, starts_on, ends_on')
        .lte('starts_on', new Date().toISOString().slice(0, 10))
        .gte('ends_on', new Date().toISOString().slice(0, 10)),
    ]);

    if (membersResult.error) {
      throw new Error(membersResult.error.message || 'Kunde inte hämta content managers');
    }
    if (assignmentsResult.error) {
      throw new Error(assignmentsResult.error.message || 'Kunde inte hämta CM-assignments');
    }
    if (absencesResult.error) {
      throw new Error(absencesResult.error.message || 'Kunde inte hämta CM-frånvaro');
    }

    const customerCountByCm = new Map<string, number>();
    for (const assignment of assignmentsResult.data ?? []) {
      if (!assignment.cm_id) continue;
      customerCountByCm.set(
        assignment.cm_id,
        (customerCountByCm.get(assignment.cm_id) ?? 0) + 1,
      );
    }

    const absentCmIds = new Set(
      (absencesResult.data ?? [])
        .map((absence) => absence.cm_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    );

    const items = ((membersResult.data ?? []) as unknown as TeamMemberLite[]).map((member) => ({
      id: member.id,
      full_name: member.name ?? 'Content Manager',
      email: member.email ?? null,
      city: member.region ?? null,
      avatar_url: member.avatar_url ?? null,
      commission_rate:
        typeof member.commission_rate === 'number' ? member.commission_rate : null,
      start_date: member.start_date ?? null,
      active_customer_count: customerCountByCm.get(member.id) ?? 0,
      on_absence: absentCmIds.has(member.id),
    }));

    return jsonOk({ items });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte hämta tillgängliga content managers',
      500,
    );
  }
}, ['admin']);
