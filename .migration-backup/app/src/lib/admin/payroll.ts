import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_ADMIN_SETTINGS,
  getAdminSettings,
} from '@/lib/admin/settings';
import {
  type BillingPeriod,
  listRecentBillingPeriods,
  overlapDays,
  resolveBillingPeriod,
  toExclusiveDate,
} from '@/lib/admin/billing-periods';
import { listScheduledAssignmentChanges } from '@/lib/admin/cm-assignments';
import { isMissingColumnError } from '@/lib/admin/schema-guards';

type TeamMemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  profile_id: string | null;
  commission_rate?: number | null;
};

type CustomerRow = {
  id: string;
  business_name: string;
  status: string;
  paused_until: string | null;
};

type AssignmentRow = {
  customer_id: string;
  cm_id: string | null;
  valid_from: string;
  valid_to: string | null;
};

export type PayrollCustomerBreakdown = {
  customer_id: string;
  customer_name: string;
  billed_ore: number;
  payout_ore: number;
  billable_days: number;
  pro_rata_label?: string | null;
};

export type PayrollRow = {
  cm_id: string;
  cm_name: string;
  cm_email: string | null;
  commission_rate: number;
  assigned_customers: number;
  active_customers: number;
  billed_ore: number;
  payout_ore: number;
  billable_days: number;
  customer_breakdown: PayrollCustomerBreakdown[];
};

type PayrollViewRow = {
  period_key: string;
  period_label: string;
  period_start: string;
  period_end: string;
  customer_id: string;
  customer_name: string;
  cm_id: string;
  cm_name: string | null;
  cm_email: string | null;
  commission_rate: number | null;
  billed_ore: number;
  billable_days: number;
};

type LegacyPayrollViewRow = {
  period_key: string;
  period_label: string;
  period_start: string;
  period_end: string;
  stripe_invoice_id: string;
  billed_ore: number;
};

export async function getPayrollSnapshot(
  supabaseAdmin: SupabaseClient,
  options?: { period?: string | null; includeCustomerBreakdown?: boolean; includePreviousPeriod?: boolean },
) {
  const includeCustomerBreakdown = options?.includeCustomerBreakdown ?? true;
  const includePreviousPeriod = options?.includePreviousPeriod ?? true; // Default to true for backward compatibility
  const period = resolveBillingPeriod(options?.period);
  const availablePeriods = listRecentBillingPeriods(6);
  const previousPeriod = includePreviousPeriod ? resolvePreviousPayrollPeriod(availablePeriods, period.key) : null;

  const [
    settingsResult,
    membersResult,
    customersResult,
    assignmentsResult,
    payrollViewResult,
    scheduledChanges,
    previousAssignmentsResult,
    previousPayrollViewResult,
  ] = await Promise.all([
    getAdminSettings(supabaseAdmin),
    fetchTeamMembers(supabaseAdmin),
    supabaseAdmin
      .from('customer_profiles')
      .select('id, business_name, status, paused_until')
      .neq('status', 'archived'),
    fetchAssignmentsForPeriod(supabaseAdmin, period.start_date, period.end_exclusive),
    fetchPayrollViewRows(supabaseAdmin, period),
    listScheduledAssignmentChanges(supabaseAdmin),
    previousPeriod
      ? fetchAssignmentsForPeriod(
          supabaseAdmin,
          previousPeriod.start_date,
          previousPeriod.end_exclusive,
        )
      : Promise.resolve({ data: [] as AssignmentRow[], schemaWarnings: [] as string[] }),
    previousPeriod
      ? fetchPayrollViewRows(supabaseAdmin, previousPeriod)
      : Promise.resolve({ data: [] as PayrollViewRow[], schemaWarnings: [] as string[] }),
  ]);

  if (customersResult.error) {
    throw new Error(customersResult.error.message || 'Kunde inte hämta kunder');
  }

  const rows = buildViewPayrollRows({
    members: membersResult.data,
    customers: (customersResult.data ?? []) as CustomerRow[],
    assignments: assignmentsResult.data,
    viewRows: payrollViewResult.data,
    defaultCommissionRate: settingsResult.settings.default_commission_rate,
    includeCustomerBreakdown,
  });
  const previousRows = previousPeriod
    ? buildViewPayrollRows({
        members: membersResult.data,
        customers: (customersResult.data ?? []) as CustomerRow[],
        assignments: previousAssignmentsResult.data,
        viewRows: previousPayrollViewResult.data,
        defaultCommissionRate: settingsResult.settings.default_commission_rate,
        includeCustomerBreakdown: false,
      })
    : [];

  const totals = {
    cm_count: rows.length,
    assigned_customers: rows.reduce((sum, row) => sum + row.assigned_customers, 0),
    active_customers: rows.reduce((sum, row) => sum + row.active_customers, 0),
    billed_ore: rows.reduce((sum, row) => sum + row.billed_ore, 0),
    payout_ore: rows.reduce((sum, row) => sum + row.payout_ore, 0),
    billable_days: rows.reduce((sum, row) => sum + row.billable_days, 0),
    previous: previousPeriod
      ? {
          billed_ore: previousRows.reduce((sum, row) => sum + row.billed_ore, 0),
          payout_ore: previousRows.reduce((sum, row) => sum + row.payout_ore, 0),
          billable_days: previousRows.reduce((sum, row) => sum + row.billable_days, 0),
        }
      : undefined,
  };

  const schemaWarnings = Array.from(
    new Set([
      ...settingsResult.schemaWarnings,
      ...membersResult.schemaWarnings,
      ...assignmentsResult.schemaWarnings,
      ...payrollViewResult.schemaWarnings,
      ...previousAssignmentsResult.schemaWarnings,
      ...previousPayrollViewResult.schemaWarnings,
    ]),
  );

  return {
    period,
    available_periods: availablePeriods,
    rows,
    totals,
    scheduled_changes: scheduledChanges,
    settings: settingsResult.settings,
    schemaWarnings,
  };
}

export type PayrollBreakdown = {
  period_key: string;
  cm_id: string;
  cm_name: string;
  cm_email: string | null;
  customers: PayrollCustomerBreakdown[];
};

export async function getPayrollBreakdown(
  supabaseAdmin: SupabaseClient,
  options: { period: string; cmId: string },
): Promise<PayrollBreakdown | null> {
  const snapshot = await getPayrollSnapshot(supabaseAdmin, {
    period: options.period,
    includeCustomerBreakdown: true,
  });
  const row = snapshot.rows.find((entry) => entry.cm_id === options.cmId);

  if (!row) {
    return null;
  }

  return {
    period_key: snapshot.period.key,
    cm_id: row.cm_id,
    cm_name: row.cm_name,
    cm_email: row.cm_email,
    customers: row.customer_breakdown,
  };
}

export type PayrollExportRow = {
  period_key: string;
  period_label: string;
  cm_id: string;
  cm_name: string;
  cm_email: string | null;
  commission_rate_percent: number;
  customer_id: string;
  customer_name: string;
  billed_ore: number;
  payout_ore: number;
  billable_days: number;
};

export async function getPayrollExportRows(
  supabaseAdmin: SupabaseClient,
  options: { period: string; cmId?: string | null },
) {
  const snapshot = await getPayrollSnapshot(supabaseAdmin, {
    period: options.period,
    includeCustomerBreakdown: true,
  });

  const rows = snapshot.rows
    .filter((row) => !options.cmId || row.cm_id === options.cmId)
    .flatMap((row) =>
      row.customer_breakdown.map((customer) => ({
        period_key: snapshot.period.key,
        period_label: snapshot.period.label,
        cm_id: row.cm_id,
        cm_name: row.cm_name,
        cm_email: row.cm_email,
        commission_rate_percent: Math.round(row.commission_rate * 1000) / 10,
        customer_id: customer.customer_id,
        customer_name: customer.customer_name,
        billed_ore: customer.billed_ore,
        payout_ore: customer.payout_ore,
        billable_days: customer.billable_days,
      })),
    );

  return {
    period: snapshot.period,
    rows,
  };
}

function buildViewPayrollRows(params: {
  members: TeamMemberRow[];
  customers: CustomerRow[];
  assignments: AssignmentRow[];
  viewRows: PayrollViewRow[];
  defaultCommissionRate: number;
  includeCustomerBreakdown: boolean;
}) {
  const assignmentMap = new Map(
    params.assignments
      .filter((row) => row.cm_id)
      .map((row) => [row.customer_id, row.cm_id as string]),
  );

  // Count occurrences of each customer to detect shared months
  const customerOccurrenceCount = new Map<string, number>();
  for (const row of params.viewRows) {
    customerOccurrenceCount.set(row.customer_id, (customerOccurrenceCount.get(row.customer_id) || 0) + 1);
  }

  const totalsByMember = new Map<string, Map<string, PayrollCustomerBreakdown>>();

  for (const row of params.viewRows) {
    const memberTotals =
      totalsByMember.get(row.cm_id) ?? new Map<string, PayrollCustomerBreakdown>();
    
    const isShared = (customerOccurrenceCount.get(row.customer_id) || 0) > 1;
    
    const existing = memberTotals.get(row.customer_id) ?? {
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      billed_ore: 0,
      payout_ore: 0,
      billable_days: 0,
      pro_rata_label: isShared ? `delad månad` : null,
    };
    const commissionRate = clampRate(row.commission_rate ?? params.defaultCommissionRate);
    existing.billed_ore += row.billed_ore;
    existing.billable_days += row.billable_days;
    existing.payout_ore = Math.round(existing.billed_ore * commissionRate);
    
    if (isShared) {
      // Find total billable days for this customer across all members in this period
      const totalCustomerDays = params.viewRows
        .filter(r => r.customer_id === row.customer_id)
        .reduce((s, r) => s + r.billable_days, 0);
      existing.pro_rata_label = `${existing.billable_days}/${totalCustomerDays} dagar`;
    }

    memberTotals.set(row.customer_id, existing);
    totalsByMember.set(row.cm_id, memberTotals);
  }

  return params.members
    .map((member) => {
      const assignedCustomers = params.customers.filter(
        (customer) => assignmentMap.get(customer.id) === member.id,
      );
      const activeCustomers = assignedCustomers.filter(
        (customer) =>
          ['active', 'agreed', 'pending_invoice'].includes(customer.status) &&
          !customer.paused_until,
      );
      const breakdown = Array.from(totalsByMember.get(member.id)?.values() ?? []).sort(
        (left, right) =>
          right.billed_ore - left.billed_ore || right.billable_days - left.billable_days,
      );
      const commissionRate = clampRate(
        member.commission_rate ??
          params.viewRows.find((row) => row.cm_id === member.id)?.commission_rate ??
          params.defaultCommissionRate,
      );
      const billedOre = breakdown.reduce((sum, customer) => sum + customer.billed_ore, 0);
      const billableDays = breakdown.reduce(
        (sum, customer) => sum + customer.billable_days,
        0,
      );

      return {
        cm_id: member.id,
        cm_name: member.name || 'Namn saknas',
        cm_email: member.email ?? null,
        commission_rate: commissionRate,
        assigned_customers: assignedCustomers.length,
        active_customers: activeCustomers.length,
        billed_ore: billedOre,
        payout_ore: Math.round(billedOre * commissionRate),
        billable_days: billableDays,
        customer_breakdown: params.includeCustomerBreakdown ? breakdown : [],
      } satisfies PayrollRow;
    })
    .sort(
      (left, right) => right.payout_ore - left.payout_ore || right.billed_ore - left.billed_ore,
    );
}

function resolvePreviousPayrollPeriod(
  periods: ReturnType<typeof listRecentBillingPeriods>,
  currentPeriodKey: string,
) {
  const index = periods.findIndex((period) => period.key === currentPeriodKey);
  if (index === -1) {
    return periods[1] ?? null;
  }
  return periods[index + 1] ?? null;
}

async function fetchPayrollViewRows(supabaseAdmin: SupabaseClient, period: BillingPeriod) {
  const result = await (((supabaseAdmin.from('v_admin_payroll_period' as never) as never) as {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<{
        data: PayrollViewRow[] | null;
        error: { message?: string } | null;
      }>;
    };
  }).select(
    'period_key, period_label, period_start, period_end, customer_id, customer_name, cm_id, cm_name, cm_email, commission_rate, billed_ore, billable_days',
  )).eq('period_key', period.key);

  if (result.error) {
    if (isMissingColumnError(result.error.message)) {
      return fetchLegacyPayrollViewRows(supabaseAdmin, period);
    }
    throw new Error(result.error.message || 'Kunde inte hamta payroll-vyn');
  }

  return {
    data: (result.data ?? []) as PayrollViewRow[],
    schemaWarnings: [] as string[],
  };
}

async function fetchLegacyPayrollViewRows(
  supabaseAdmin: SupabaseClient,
  period: BillingPeriod,
): Promise<{ data: PayrollViewRow[]; schemaWarnings: string[] }> {
  const legacyViewResult = await (((supabaseAdmin.from('v_admin_payroll_period' as never) as never) as {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<{
        data: LegacyPayrollViewRow[] | null;
        error: { message?: string } | null;
      }>;
    };
  }).select(
    'period_key, period_label, period_start, period_end, stripe_invoice_id, billed_ore',
  )).eq('period_key', period.key);

  if (legacyViewResult.error) {
    throw new Error(legacyViewResult.error.message || 'Kunde inte hamta payroll-vyn');
  }

  const legacyRows = (legacyViewResult.data ?? []).filter((row) => Boolean(row.stripe_invoice_id));
  if (legacyRows.length === 0) {
    return {
      data: [],
      schemaWarnings: ['Payroll-vyn saknar CM/customer-kolumner. Fallback aktiverad.'],
    };
  }

  const invoiceIds = Array.from(new Set(legacyRows.map((row) => row.stripe_invoice_id)));
  const invoicesResult = await (((supabaseAdmin.from('invoices' as never) as never) as {
    select: (columns: string) => {
      in: (column: string, values: string[]) => Promise<{
        data: Array<{
          stripe_invoice_id: string;
          customer_profile_id: string | null;
          status: string | null;
        }> | null;
        error: { message?: string } | null;
      }>;
    };
  }).select('stripe_invoice_id, customer_profile_id, status')).in('stripe_invoice_id', invoiceIds);

  if (invoicesResult.error) {
    throw new Error(invoicesResult.error.message || 'Kunde inte hamta fakturor for payroll');
  }

  const paidOrOpenByInvoice = new Map<string, string>();
  for (const invoice of invoicesResult.data ?? []) {
    if (!invoice.customer_profile_id) continue;
    if (invoice.status !== 'open' && invoice.status !== 'paid') continue;
    paidOrOpenByInvoice.set(invoice.stripe_invoice_id, invoice.customer_profile_id);
  }

  const customerIds = Array.from(new Set(Array.from(paidOrOpenByInvoice.values())));
  const customerNameById = new Map<string, string>();
  if (customerIds.length > 0) {
    const customersResult = await (((supabaseAdmin.from('customer_profiles' as never) as never) as {
      select: (columns: string) => {
        in: (column: string, values: string[]) => Promise<{
          data: Array<{ id: string; business_name: string | null }> | null;
          error: { message?: string } | null;
        }>;
      };
    }).select('id, business_name')).in('id', customerIds);

    if (customersResult.error) {
      throw new Error(customersResult.error.message || 'Kunde inte hamta kunder for payroll');
    }

    for (const customer of customersResult.data ?? []) {
      customerNameById.set(customer.id, customer.business_name || 'Namn saknas');
    }
  }

  const [assignmentsResult, membersResult] = await Promise.all([
    fetchAssignmentsForPeriod(supabaseAdmin, period.start_date, period.end_exclusive),
    fetchTeamMembers(supabaseAdmin),
  ]);
  const memberById = new Map(membersResult.data.map((member) => [member.id, member]));

  const assignmentsByCustomerId = new Map<string, AssignmentRow[]>();
  for (const assignment of assignmentsResult.data) {
    if (!assignment.cm_id) continue;
    const existing = assignmentsByCustomerId.get(assignment.customer_id) ?? [];
    existing.push(assignment);
    assignmentsByCustomerId.set(assignment.customer_id, existing);
  }

  const normalizedRows: PayrollViewRow[] = [];
  for (const row of legacyRows) {
    const customerId = paidOrOpenByInvoice.get(row.stripe_invoice_id);
    if (!customerId) continue;

    const rowStart = toDateOnly(row.period_start) ?? period.start_date;
    const rowEndExclusive = toDateOnly(row.period_end) ?? period.end_exclusive;
    const totalDays = Math.max(overlapDays(rowStart, rowEndExclusive, rowStart, rowEndExclusive), 1);
    const billedOre = Math.max(0, Math.round(Number(row.billed_ore) || 0));
    if (billedOre <= 0) continue;

    const overlappingAssignments = (assignmentsByCustomerId.get(customerId) ?? [])
      .map((assignment) => {
        const assignmentStart = toDateOnly(assignment.valid_from) ?? period.start_date;
        const assignmentEndExclusive = toExclusiveDate(assignment.valid_to) ?? period.end_exclusive;
        const days = overlapDays(assignmentStart, assignmentEndExclusive, rowStart, rowEndExclusive);
        return { assignment, days };
      })
      .filter((entry) => entry.days > 0);

    if (overlappingAssignments.length === 0) {
      continue;
    }

    let remainderOre = billedOre;
    for (let index = 0; index < overlappingAssignments.length; index += 1) {
      const entry = overlappingAssignments[index];
      const isLast = index === overlappingAssignments.length - 1;
      const allocatedOre = isLast ? remainderOre : Math.round((billedOre * entry.days) / totalDays);
      remainderOre -= allocatedOre;

      const cmId = entry.assignment.cm_id as string;
      const member = memberById.get(cmId);
      normalizedRows.push({
        period_key: row.period_key,
        period_label: row.period_label,
        period_start: rowStart,
        period_end: rowEndExclusive,
        customer_id: customerId,
        customer_name: customerNameById.get(customerId) || 'Namn saknas',
        cm_id: cmId,
        cm_name: member?.name ?? null,
        cm_email: member?.email ?? null,
        commission_rate: member?.commission_rate ?? null,
        billed_ore: allocatedOre,
        billable_days: entry.days,
      });
    }
  }

  return {
    data: normalizedRows,
    schemaWarnings: ['Payroll-vyn saknar CM/customer-kolumner. Fallback aktiverad.'],
  };
}

async function fetchTeamMembers(supabaseAdmin: SupabaseClient) {
  const primary = await supabaseAdmin
    .from('team_members')
    .select('id, name, email, profile_id, commission_rate')
    .eq('is_active', true)
    .order('name');

  if (primary.error) {
    throw new Error(primary.error.message || 'Kunde inte hämta teammedlemmar');
  }

  return {
    data: (primary.data ?? []) as TeamMemberRow[],
    schemaWarnings: [] as string[],
  };
}

async function fetchAssignmentsForPeriod(
  supabaseAdmin: SupabaseClient,
  periodStartDate: string,
  periodEndExclusive: string,
) {
  const result = await (((supabaseAdmin.from('cm_assignments' as never) as never) as {
    select: (columns: string) => {
      lt: (column: string, value: string) => {
        or: (value: string) => Promise<{
          data: AssignmentRow[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
  }).select('customer_id, cm_id, valid_from, valid_to')).lt('valid_from', periodEndExclusive).or(
    `valid_to.is.null,valid_to.gte.${periodStartDate}`,
  );

  if (result.error) {
    throw new Error(result.error.message || 'Kunde inte hamta CM assignments');
  }

  return {
    data: (result.data ?? []).filter((row) => Boolean(row.customer_id)),
    schemaWarnings: [] as string[],
  };
}

function clampRate(value: number) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric)
    ? numeric
    : DEFAULT_ADMIN_SETTINGS.default_commission_rate;
  return Math.max(0, Math.min(1, safe));
}

function toDateOnly(value: unknown) {
  if (typeof value !== 'string') return null;
  const candidate = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

