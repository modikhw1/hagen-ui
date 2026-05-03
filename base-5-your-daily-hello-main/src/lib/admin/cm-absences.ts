import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, formatDateOnly, overlapDays, parseDateOnly, toExclusiveDate } from '@/lib/admin/billing-periods';
import { isMissingRelationError } from '@/lib/admin/schema-guards';

export type CmAbsenceType =
  | 'vacation'
  | 'sick'
  | 'parental_leave'
  | 'training'
  | 'temporary_coverage'
  | 'other';

export type CompensationMode = 'covering_cm' | 'primary_cm';

export type CmAbsenceRecord = {
  id: string;
  cm_id: string;
  customer_profile_id: string | null;
  backup_cm_id: string | null;
  absence_type: CmAbsenceType;
  compensation_mode: CompensationMode;
  starts_on: string;
  ends_on: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EnrichedCmAbsence = CmAbsenceRecord & {
  cm_name: string | null;
  backup_cm_name: string | null;
  customer_name: string | null;
  is_active: boolean;
  is_upcoming: boolean;
};

type CoverageSegment = {
  start: string;
  end_exclusive: string;
  days: number;
  responsible_cm_id: string | null;
  payout_cm_id: string | null;
  applied_absence_id: string | null;
};

type CreateCmAbsenceInput = {
  cmId: string;
  customerProfileId?: string | null;
  backupCmId?: string | null;
  absenceType: CmAbsenceType;
  compensationMode: CompensationMode;
  startsOn: string;
  endsOn: string;
  note?: string | null;
  createdBy?: string | null;
};

const CM_ABSENCE_COLUMNS =
  'id, cm_id, customer_profile_id, backup_cm_id, absence_type, compensation_mode, starts_on, ends_on, note, created_by, created_at, updated_at';

type CmAbsenceQueryResult = Promise<{
  data: CmAbsenceRecord[] | null;
  error: { message?: string } | null;
}>;

type CmAbsenceQueryBuilder = {
  eq: (column: string, value: string) => CmAbsenceQueryBuilder;
  lte: (column: string, value: string) => CmAbsenceQueryBuilder;
  gte: (column: string, value: string) => CmAbsenceQueryBuilder;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => {
    limit: (value: number) => CmAbsenceQueryResult;
  };
  limit: (value: number) => CmAbsenceQueryResult;
};

export async function listCmAbsences(
  supabaseAdmin: SupabaseClient,
  options: {
    startsBeforeOrOn?: string | null;
    endsAfterOrOn?: string | null;
    cmId?: string | null;
    customerProfileId?: string | null;
    limit?: number;
  } = {},
): Promise<CmAbsenceRecord[]> {
  let query = ((supabaseAdmin.from('cm_absences' as never) as never) as {
    select: (columns: string) => CmAbsenceQueryBuilder;
  }).select(CM_ABSENCE_COLUMNS);

  if (options.cmId) {
    query = query.eq('cm_id', options.cmId);
  }

  if (options.customerProfileId) {
    query = query.eq('customer_profile_id', options.customerProfileId);
  }

  if (options.startsBeforeOrOn) {
    query = query.lte('starts_on', options.startsBeforeOrOn);
  }

  if (options.endsAfterOrOn) {
    query = query.gte('ends_on', options.endsAfterOrOn);
  }

  const result = await query
    .order('starts_on', { ascending: false })
    .limit(options.limit ?? 100);

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return [];
    }

    throw new Error(result.error.message || 'Kunde inte läsa CM-frånvaro');
  }

  return result.data ?? [];
}

export async function listEnrichedCmAbsences(
  supabaseAdmin: SupabaseClient,
  options: {
    startsBeforeOrOn?: string | null;
    endsAfterOrOn?: string | null;
    cmId?: string | null;
    customerProfileId?: string | null;
    limit?: number;
    asOfDate?: string;
  } = {},
): Promise<EnrichedCmAbsence[]> {
  const absences = await listCmAbsences(supabaseAdmin, options);
  if (absences.length === 0) {
    return [];
  }

  const cmIds = Array.from(
    new Set(absences.flatMap((absence) => [absence.cm_id, absence.backup_cm_id].filter(Boolean) as string[])),
  );
  const customerIds = Array.from(
    new Set(absences.map((absence) => absence.customer_profile_id).filter(Boolean) as string[]),
  );
  const [teamResult, customerResult] = await Promise.all([
    supabaseAdmin.from('team_members').select('id, name').in('id', cmIds),
    customerIds.length > 0
      ? supabaseAdmin.from('customer_profiles').select('id, business_name').in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (teamResult.error) {
    throw new Error(teamResult.error.message || 'Kunde inte läsa teamnamn');
  }
  if (customerResult.error) {
    throw new Error(customerResult.error.message || 'Kunde inte läsa kundnamn');
  }

  const teamById = new Map((teamResult.data ?? []).map((row) => [row.id, row.name]));
  const customerById = new Map((customerResult.data ?? []).map((row) => [row.id, row.business_name]));
  const asOf = options.asOfDate ?? formatDateOnly(new Date());

  return absences.map((absence) => ({
    ...absence,
    cm_name: teamById.get(absence.cm_id) ?? null,
    backup_cm_name: absence.backup_cm_id ? teamById.get(absence.backup_cm_id) ?? null : null,
    customer_name: absence.customer_profile_id
      ? customerById.get(absence.customer_profile_id) ?? null
      : null,
    is_active: absence.starts_on <= asOf && absence.ends_on >= asOf,
    is_upcoming: absence.starts_on > asOf,
  }));
}

export async function createCmAbsence(
  supabaseAdmin: SupabaseClient,
  input: CreateCmAbsenceInput,
) {
  const normalizedStartsOn = input.startsOn;
  const normalizedEndsOn = input.endsOn;
  if (normalizedEndsOn < normalizedStartsOn) {
    throw new Error('Slutdatum måste vara samma dag eller senare än startdatum');
  }

  const overlapping = await findOverlappingAbsences(supabaseAdmin, {
    cmId: input.cmId,
    customerProfileId: input.customerProfileId ?? null,
    startsOn: normalizedStartsOn,
    endsOn: normalizedEndsOn,
  });

  if (overlapping.length > 0) {
    throw new Error('Det finns redan en aktiv eller schemalagd coverage/frånvaro i valt intervall');
  }

  const result = await (((supabaseAdmin.from('cm_absences' as never) as never) as {
    insert: (value: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: CmAbsenceRecord | null;
          error: { message?: string } | null;
        }>;
      };
    };
  }).insert({
    cm_id: input.cmId,
    customer_profile_id: input.customerProfileId ?? null,
    backup_cm_id: input.backupCmId ?? null,
    absence_type: input.absenceType,
    compensation_mode: input.compensationMode,
    starts_on: normalizedStartsOn,
    ends_on: normalizedEndsOn,
    note: input.note ?? null,
    created_by: input.createdBy ?? null,
  })).select(CM_ABSENCE_COLUMNS).single();

  if (result.error || !result.data) {
    if (isMissingRelationError(result.error?.message)) {
      throw new Error('Tabellen cm_absences saknas i databasen. Kör migrationen för §6.');
    }

    throw new Error(result.error?.message || 'Kunde inte skapa CM-frånvaro');
  }

  return result.data;
}

export async function getCmAbsenceById(
  supabaseAdmin: SupabaseClient,
  absenceId: string,
) {
  const result = await (((supabaseAdmin.from('cm_absences' as never) as never) as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: CmAbsenceRecord | null;
          error: { message?: string } | null;
        }>;
      };
    };
  }).select(CM_ABSENCE_COLUMNS)).eq('id', absenceId).maybeSingle();

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return null;
    }

    throw new Error(result.error.message || 'Kunde inte läsa CM-frånvaro');
  }

  return result.data ?? null;
}

export async function endCmAbsence(
  supabaseAdmin: SupabaseClient,
  absenceId: string,
  asOfDate = formatDateOnly(new Date()),
) {
  const existing = await getCmAbsenceById(supabaseAdmin, absenceId);
  if (!existing) {
    throw new Error('Frånvaro hittades inte');
  }

  const nextEndsOn =
    existing.ends_on <= asOfDate
      ? existing.ends_on
      : existing.starts_on > asOfDate
        ? existing.starts_on
        : asOfDate;

  const result = await (((supabaseAdmin.from('cm_absences' as never) as never) as {
    update: (value: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        select: (columns: string) => {
          single: () => Promise<{
            data: CmAbsenceRecord | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  }).update({
    ends_on: nextEndsOn,
  })).eq('id', absenceId).select(CM_ABSENCE_COLUMNS).single();

  if (result.error || !result.data) {
    if (isMissingRelationError(result.error?.message)) {
      throw new Error('Tabellen cm_absences saknas i databasen. Kör migrationen för §6.');
    }

    throw new Error(result.error?.message || 'Kunde inte avsluta CM-frånvaro');
  }

  return result.data;
}

export async function deleteCmAbsence(
  supabaseAdmin: SupabaseClient,
  absenceId: string,
) {
  const result = await (((supabaseAdmin.from('cm_absences' as never) as never) as {
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
    };
  }).delete()).eq('id', absenceId);

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      throw new Error('Tabellen cm_absences saknas i databasen. Kör migrationen för §6.');
    }

    throw new Error(result.error.message || 'Kunde inte ta bort CM-frånvaro');
  }
}

export function resolveAbsenceCoverage(params: {
  absences: CmAbsenceRecord[];
  customerId: string;
  primaryCmId: string | null;
  start: string;
  endExclusive: string;
}) {
  if (!params.primaryCmId) {
    return [] as CoverageSegment[];
  }

  const relevant = params.absences.filter((absence) => {
    const absenceEndExclusive = toExclusiveDate(absence.ends_on);
    if (!absenceEndExclusive) {
      return false;
    }

    if (absence.cm_id !== params.primaryCmId) {
      return false;
    }

    if (absence.customer_profile_id && absence.customer_profile_id !== params.customerId) {
      return false;
    }

    return overlapDays(
      params.start,
      params.endExclusive,
      absence.starts_on,
      absenceEndExclusive,
    ) > 0;
  });

  if (relevant.length === 0) {
    return [
      {
        start: params.start,
        end_exclusive: params.endExclusive,
        days: overlapDays(params.start, params.endExclusive, params.start, params.endExclusive),
        responsible_cm_id: params.primaryCmId,
        payout_cm_id: params.primaryCmId,
        applied_absence_id: null,
      },
    ];
  }

  const boundaries = new Set<string>([params.start, params.endExclusive]);
  relevant.forEach((absence) => {
    const absenceEndExclusive = toExclusiveDate(absence.ends_on);
    if (!absenceEndExclusive) {
      return;
    }
    boundaries.add(maxDate(params.start, absence.starts_on));
    boundaries.add(minDate(params.endExclusive, absenceEndExclusive));
  });

  const sortedBoundaries = Array.from(boundaries).sort();

  return sortedBoundaries
    .slice(0, -1)
    .map((boundary, index) => {
      const segmentEndExclusive = sortedBoundaries[index + 1];
      if (!segmentEndExclusive) {
        return null;
      }
      const days = overlapDays(boundary, segmentEndExclusive, boundary, segmentEndExclusive);
      if (days <= 0) {
        return null;
      }

      const applied = pickApplicableAbsence(relevant, params.customerId, boundary);
      if (!applied) {
        return {
          start: boundary,
          end_exclusive: segmentEndExclusive,
          days,
          responsible_cm_id: params.primaryCmId,
          payout_cm_id: params.primaryCmId,
          applied_absence_id: null,
        } satisfies CoverageSegment;
      }

      const responsibleCmId = applied.backup_cm_id ?? params.primaryCmId;
      const payoutCmId =
        applied.compensation_mode === 'primary_cm'
          ? params.primaryCmId
          : applied.backup_cm_id ?? params.primaryCmId;

      return {
        start: boundary,
        end_exclusive: segmentEndExclusive,
        days,
        responsible_cm_id: responsibleCmId,
        payout_cm_id: payoutCmId,
        applied_absence_id: applied.id,
      } satisfies CoverageSegment;
    })
    .filter((segment): segment is CoverageSegment => segment !== null);
}

export function findActiveCmAbsence<T extends CmAbsenceRecord>(
  absences: T[],
  cmId: string,
  asOfDate: string,
) {
  return pickApplicableAbsence(
    absences.filter((absence) => absence.cm_id === cmId && !absence.customer_profile_id),
    null,
    asOfDate,
  );
}

export function resolveEffectiveCustomerCoverage(params: {
  absences: CmAbsenceRecord[];
  customerId: string;
  primaryCmId: string | null;
  asOfDate: string;
}) {
  const segment = resolveAbsenceCoverage({
    absences: params.absences,
    customerId: params.customerId,
    primaryCmId: params.primaryCmId,
    start: params.asOfDate,
    endExclusive: formatDateOnly(addDays(parseDateOnly(params.asOfDate), 1)),
  })[0];

  return {
    responsibleCmId: segment?.responsible_cm_id ?? params.primaryCmId,
    payoutCmId: segment?.payout_cm_id ?? params.primaryCmId,
    appliedAbsenceId: segment?.applied_absence_id ?? null,
  };
}

async function findOverlappingAbsences(
  supabaseAdmin: SupabaseClient,
  params: {
    cmId: string;
    customerProfileId: string | null;
    startsOn: string;
    endsOn: string;
  },
) {
  const result = await (((supabaseAdmin.from('cm_absences' as never) as never) as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        lte: (column: string, value: string) => {
          gte: (column: string, value: string) => CmAbsenceQueryResult;
        };
      };
    };
  }).select(CM_ABSENCE_COLUMNS))
    .eq('cm_id', params.cmId)
    .lte('starts_on', params.endsOn)
    .gte('ends_on', params.startsOn);

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return [];
    }

    throw new Error(result.error.message || 'Kunde inte validera överlappande frånvaro');
  }

  return (result.data ?? []).filter((absence: CmAbsenceRecord) => {
    if (params.customerProfileId) {
      return absence.customer_profile_id === params.customerProfileId;
    }

    return absence.customer_profile_id === null;
  });
}

function pickApplicableAbsence<T extends CmAbsenceRecord>(
  absences: T[],
  customerId: string | null,
  asOfDate: string,
) {
  return absences
    .filter((absence) => absence.starts_on <= asOfDate && absence.ends_on >= asOfDate)
    .sort((left, right) => {
      const leftSpecific = left.customer_profile_id === customerId ? 0 : 1;
      const rightSpecific = right.customer_profile_id === customerId ? 0 : 1;
      return leftSpecific - rightSpecific || right.created_at.localeCompare(left.created_at);
    })[0] ?? null;
}

function minDate(left: string, right: string) {
  return left <= right ? left : right;
}

function maxDate(left: string, right: string) {
  return left >= right ? left : right;
}
