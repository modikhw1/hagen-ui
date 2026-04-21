import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_ADMIN_SETTINGS,
  getAdminSettings,
} from '@/lib/admin/settings';
import {
  listCmAbsences,
  resolveAbsenceCoverage,
  type CmAbsenceRecord,
} from '@/lib/admin/cm-absences';
import {
  listRecentBillingPeriods,
  overlapDays,
  resolveBillingPeriod,
  toExclusiveDate,
} from '@/lib/admin/billing-periods';
import { listScheduledAssignmentChanges } from '@/lib/admin/cm-assignments';
import { isMissingColumnError, isMissingRelationError } from '@/lib/admin/schema-guards';

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
  monthly_price: number | null;
  status: string;
  paused_until: string | null;
  account_manager_profile_id: string | null;
  account_manager: string | null;
};

type AssignmentRow = {
  customer_id: string;
  cm_id: string | null;
  valid_from: string;
  valid_to: string | null;
};

type InvoiceMirrorRow = {
  stripe_invoice_id: string;
  customer_profile_id: string | null;
  status: string;
};

type InvoiceLineItemRow = {
  stripe_line_item_id: string;
  stripe_invoice_id: string;
  description: string;
  amount: number;
  currency: string;
  period_start: string | null;
  period_end: string | null;
};

export type PayrollCustomerBreakdown = {
  customer_id: string;
  customer_name: string;
  billed_ore: number;
  payout_ore: number;
  billable_days: number;
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
  source: 'invoice_line_items' | 'customer_profiles_fallback';
};

export async function getPayrollSnapshot(
  supabaseAdmin: SupabaseClient,
  options?: { period?: string | null },
) {
  const schemaWarnings: string[] = [];
  const settingsResult = await getAdminSettings(supabaseAdmin);
  schemaWarnings.push(...settingsResult.schemaWarnings);

  const period = resolveBillingPeriod(options?.period);
  const availablePeriods = listRecentBillingPeriods(6);

  const [membersResult, customersResult, assignmentsResult, lineItemsResult, scheduledChanges, absences] = await Promise.all([
    fetchTeamMembers(supabaseAdmin),
    supabaseAdmin
      .from('customer_profiles')
      .select('id, business_name, monthly_price, status, paused_until, account_manager_profile_id, account_manager')
      .neq('status', 'archived'),
    fetchAssignmentsForPeriod(supabaseAdmin, period.start_date, period.end_exclusive),
    fetchInvoiceLineItemsForPeriod(supabaseAdmin, period.start_date, period.end_exclusive),
    listScheduledAssignmentChanges(supabaseAdmin),
    listCmAbsences(supabaseAdmin, {
      startsBeforeOrOn: period.end_exclusive,
      endsAfterOrOn: period.start_date,
      limit: 500,
    }),
  ]);

  if (customersResult.error) {
    throw new Error(customersResult.error.message);
  }

  schemaWarnings.push(
    ...membersResult.schemaWarnings,
    ...assignmentsResult.schemaWarnings,
    ...lineItemsResult.schemaWarnings,
  );

  const members = membersResult.data;
  const customers = (customersResult.data ?? []) as CustomerRow[];
  const assignments = assignmentsResult.data;

  const fallbackMemberByCustomerId = new Map<string, string>();
  for (const customer of customers) {
    const fallbackMember = resolveFallbackMemberId(customer, members);
    if (fallbackMember) {
      fallbackMemberByCustomerId.set(customer.id, fallbackMember);
    }
  }

  let rows: PayrollRow[];
  let source: PayrollRow['source'] = 'invoice_line_items';

  if (lineItemsResult.lineItems.length > 0 && lineItemsResult.invoices.length > 0) {
    rows = buildLineItemPayrollRows({
      members,
      customers,
      assignments,
      lineItems: lineItemsResult.lineItems,
      invoices: lineItemsResult.invoices,
      absences,
      fallbackMemberByCustomerId,
      defaultCommissionRate: settingsResult.settings.default_commission_rate,
      period: {
        start_date: period.start_date,
        end_exclusive: period.end_exclusive,
      },
    });
  } else {
    source = 'customer_profiles_fallback';
    rows = buildFallbackPayrollRows({
      members,
      customers,
      assignments,
      fallbackMemberByCustomerId,
      defaultCommissionRate: settingsResult.settings.default_commission_rate,
    });
    if (lineItemsResult.schemaWarnings.length === 0) {
      schemaWarnings.push('Payroll saknar speglade fakturarader i vald period och visar fallback baserad pa aktuell kundportfolj.');
    }
  }

  return {
    period,
    available_periods: availablePeriods,
    rows: rows.map((row) => ({ ...row, source })),
    totals: {
      cm_count: rows.length,
      assigned_customers: rows.reduce((sum, row) => sum + row.assigned_customers, 0),
      active_customers: rows.reduce((sum, row) => sum + row.active_customers, 0),
      billed_ore: rows.reduce((sum, row) => sum + row.billed_ore, 0),
      payout_ore: rows.reduce((sum, row) => sum + row.payout_ore, 0),
      billable_days: rows.reduce((sum, row) => sum + row.billable_days, 0),
    },
    scheduled_changes: scheduledChanges,
    settings: settingsResult.settings,
    schemaWarnings: Array.from(new Set(schemaWarnings)),
  };
}

function buildLineItemPayrollRows(params: {
  members: TeamMemberRow[];
  customers: CustomerRow[];
  assignments: AssignmentRow[];
  lineItems: InvoiceLineItemRow[];
  invoices: InvoiceMirrorRow[];
  absences: CmAbsenceRecord[];
  fallbackMemberByCustomerId: Map<string, string>;
  defaultCommissionRate: number;
  period: {
    start_date: string;
    end_exclusive: string;
  };
}) {
  const invoiceById = new Map(params.invoices.map((invoice) => [invoice.stripe_invoice_id, invoice]));
  const assignmentsByCustomer = new Map<string, AssignmentRow[]>();
  for (const assignment of params.assignments) {
    const group = assignmentsByCustomer.get(assignment.customer_id) ?? [];
    group.push(assignment);
    assignmentsByCustomer.set(assignment.customer_id, group);
  }

  const totalsByMember = new Map<string, Map<string, PayrollCustomerBreakdown>>();

  for (const lineItem of params.lineItems) {
    if ((lineItem.amount ?? 0) <= 0 || !lineItem.period_start || !lineItem.period_end) {
      continue;
    }

    const invoice = invoiceById.get(lineItem.stripe_invoice_id);
    if (!invoice?.customer_profile_id || !['paid', 'open'].includes(invoice.status)) {
      continue;
    }

    const customer = params.customers.find((entry) => entry.id === invoice.customer_profile_id);
    if (!customer) {
      continue;
    }

    const lineStart = lineItem.period_start.slice(0, 10);
    const lineEndExclusive = lineItem.period_end.slice(0, 10);
    const fullLineDays = overlapDays(lineStart, lineEndExclusive, lineStart, lineEndExclusive);
    const lineDaysInPeriod = overlapDays(
      lineStart,
      lineEndExclusive,
      params.period.start_date,
      params.period.end_exclusive,
    );

    if (fullLineDays <= 0 || lineDaysInPeriod <= 0) {
      continue;
    }

    const windowAmountOre = Math.round((lineItem.amount * lineDaysInPeriod) / fullLineDays);
    const overlapStart = lineStart > params.period.start_date ? lineStart : params.period.start_date;
    const overlapEndExclusive =
      lineEndExclusive < params.period.end_exclusive
        ? lineEndExclusive
        : params.period.end_exclusive;

    const memberSlices = (assignmentsByCustomer.get(customer.id) ?? [])
      .map((assignment) => {
        const assignmentEndExclusive = assignment.valid_to
          ? toExclusiveDate(assignment.valid_to)
          : params.period.end_exclusive;
        if (!assignment.cm_id || !assignmentEndExclusive) {
          return null;
        }

        const days = overlapDays(
          overlapStart,
          overlapEndExclusive,
          assignment.valid_from,
          assignmentEndExclusive,
        );
        if (days <= 0) {
          return null;
        }

        return resolveAbsenceCoverage({
          absences: params.absences,
          customerId: customer.id,
          primaryCmId: assignment.cm_id,
          start: maxDate(overlapStart, assignment.valid_from),
          endExclusive: minDate(overlapEndExclusive, assignmentEndExclusive),
        }).map((segment) => ({
          cm_id: segment.payout_cm_id,
          days: segment.days,
        }));
      })
      .flat()
      .filter((slice): slice is { cm_id: string; days: number } => slice !== null && Boolean(slice.cm_id));

    const effectiveSlices = memberSlices.length > 0
      ? memberSlices
      : (() => {
          const fallbackMemberId = params.fallbackMemberByCustomerId.get(customer.id);
          return fallbackMemberId
            ? [{ cm_id: fallbackMemberId, days: lineDaysInPeriod }]
            : [];
        })();

    if (effectiveSlices.length === 0) {
      continue;
    }

    let allocatedOre = 0;
    effectiveSlices.forEach((slice, index) => {
      const shareOre =
        index === effectiveSlices.length - 1
          ? windowAmountOre - allocatedOre
          : Math.round((windowAmountOre * slice.days) / lineDaysInPeriod);
      allocatedOre += shareOre;

      if (!totalsByMember.has(slice.cm_id)) {
        totalsByMember.set(slice.cm_id, new Map());
      }

      const memberCustomers = totalsByMember.get(slice.cm_id)!;
      const existing = memberCustomers.get(customer.id) ?? {
        customer_id: customer.id,
        customer_name: customer.business_name,
        billed_ore: 0,
        payout_ore: 0,
        billable_days: 0,
      };

      existing.billed_ore += shareOre;
      existing.billable_days += slice.days;
      memberCustomers.set(customer.id, existing);
    });
  }

  return params.members
    .map((member) => {
      const commissionRate = clampRate(
        member.commission_rate ?? params.defaultCommissionRate ?? DEFAULT_ADMIN_SETTINGS.default_commission_rate,
      );
      const customerBreakdown = Array.from(totalsByMember.get(member.id)?.values() ?? [])
        .map((entry) => ({
          ...entry,
          payout_ore: Math.round(entry.billed_ore * commissionRate),
        }))
        .sort((left, right) => right.billed_ore - left.billed_ore);

      const billedOre = customerBreakdown.reduce((sum, entry) => sum + entry.billed_ore, 0);
      return {
        cm_id: member.id,
        cm_name: member.name || 'Namn saknas',
        cm_email: member.email ?? null,
        commission_rate: commissionRate,
        assigned_customers: customerBreakdown.length,
        active_customers: customerBreakdown.length,
        billed_ore: billedOre,
        payout_ore: Math.round(billedOre * commissionRate),
        billable_days: customerBreakdown.reduce((sum, entry) => sum + entry.billable_days, 0),
        customer_breakdown: customerBreakdown,
        source: 'invoice_line_items' as const,
      } satisfies PayrollRow;
    })
    .sort((left, right) => right.payout_ore - left.payout_ore || right.billed_ore - left.billed_ore);
}

function buildFallbackPayrollRows(params: {
  members: TeamMemberRow[];
  customers: CustomerRow[];
  assignments: AssignmentRow[];
  fallbackMemberByCustomerId: Map<string, string>;
  defaultCommissionRate: number;
}) {
  const assignmentMap = new Map(
    params.assignments
      .filter((row) => row.cm_id)
      .map((row) => [row.customer_id, row.cm_id as string]),
  );

  return params.members
    .map((member) => {
      const assignedCustomers = params.customers.filter((customer) => {
        const assignedCmId = assignmentMap.get(customer.id) ?? params.fallbackMemberByCustomerId.get(customer.id);
        return assignedCmId === member.id;
      });

      const activeCustomers = assignedCustomers.filter((customer) =>
        ['active', 'agreed', 'pending_invoice'].includes(customer.status) &&
        !customer.paused_until,
      );
      const billedOre = activeCustomers.reduce(
        (sum, customer) => sum + Math.round((Number(customer.monthly_price) || 0) * 100),
        0,
      );
      const commissionRate = clampRate(
        member.commission_rate ?? params.defaultCommissionRate ?? DEFAULT_ADMIN_SETTINGS.default_commission_rate,
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
        billable_days: 0,
        customer_breakdown: activeCustomers.map((customer) => ({
          customer_id: customer.id,
          customer_name: customer.business_name,
          billed_ore: Math.round((Number(customer.monthly_price) || 0) * 100),
          payout_ore: Math.round((Number(customer.monthly_price) || 0) * 100 * commissionRate),
          billable_days: 0,
        })),
        source: 'customer_profiles_fallback' as const,
      } satisfies PayrollRow;
    })
    .sort((left, right) => right.payout_ore - left.payout_ore || right.billed_ore - left.billed_ore);
}

async function fetchTeamMembers(supabaseAdmin: SupabaseClient) {
  const primary = await supabaseAdmin
    .from('team_members')
    .select('id, name, email, profile_id, commission_rate')
    .eq('is_active', true)
    .order('name');

  if (!primary.error) {
    return {
      data: (primary.data ?? []) as TeamMemberRow[],
      schemaWarnings: [] as string[],
    };
  }

  if (!isMissingColumnError(primary.error.message)) {
    throw new Error(primary.error.message);
  }

  const fallback = await supabaseAdmin
    .from('team_members')
    .select('id, name, email, profile_id')
    .eq('is_active', true)
    .order('name');

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return {
    data: ((fallback.data ?? []) as TeamMemberRow[]).map((member) => ({
      ...member,
      commission_rate: null,
    })),
    schemaWarnings: ['Kolumnen team_members.commission_rate saknas i databasen. Standardkommission anvands tills migrationen for §2 ar kord.'],
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
    if (isMissingRelationError(result.error.message)) {
      return {
        data: [] as AssignmentRow[],
        schemaWarnings: ['Tabellen cm_assignments saknas i databasen. Payroll anvander nuvarande kundagare som fallback.'],
      };
    }

    throw new Error(result.error.message || 'Kunde inte hamta CM assignments');
  }

  return {
    data: (result.data ?? []).filter((row) => Boolean(row.customer_id)),
    schemaWarnings: [] as string[],
  };
}

async function fetchInvoiceLineItemsForPeriod(
  supabaseAdmin: SupabaseClient,
  periodStartDate: string,
  periodEndExclusive: string,
) {
  const periodStartIso = `${periodStartDate}T00:00:00.000Z`;
  const periodEndIso = `${periodEndExclusive}T00:00:00.000Z`;
  const lineItemsResult = await supabaseAdmin
    .from('invoice_line_items')
    .select('stripe_line_item_id, stripe_invoice_id, description, amount, currency, period_start, period_end')
    .lt('period_start', periodEndIso)
    .or(`period_end.gte.${periodStartIso},period_end.is.null`);

  if (lineItemsResult.error) {
    if (isMissingRelationError(lineItemsResult.error.message)) {
      return {
        lineItems: [] as InvoiceLineItemRow[],
        invoices: [] as InvoiceMirrorRow[],
        schemaWarnings: ['Tabellen invoice_line_items saknas i databasen. Payroll kan inte periodisera fakturarader utan migrationerna for Stripe-spegeln.'],
      };
    }

    throw new Error(lineItemsResult.error.message || 'Kunde inte hamta fakturarader');
  }

  const lineItems = (lineItemsResult.data ?? []) as InvoiceLineItemRow[];
  const invoiceIds = Array.from(new Set(lineItems.map((row) => row.stripe_invoice_id).filter(Boolean)));
  if (invoiceIds.length === 0) {
    return {
      lineItems,
      invoices: [] as InvoiceMirrorRow[],
      schemaWarnings: [] as string[],
    };
  }

  const invoicesResult = await supabaseAdmin
    .from('invoices')
    .select('stripe_invoice_id, customer_profile_id, status')
    .in('stripe_invoice_id', invoiceIds);

  if (invoicesResult.error) {
    throw new Error(invoicesResult.error.message || 'Kunde inte hamta fakturaspegeln');
  }

  return {
    lineItems,
    invoices: (invoicesResult.data ?? []) as InvoiceMirrorRow[],
    schemaWarnings: [] as string[],
  };
}

function resolveFallbackMemberId(customer: CustomerRow, members: TeamMemberRow[]) {
  if (customer.account_manager_profile_id) {
    const byProfile = members.find((member) => member.profile_id === customer.account_manager_profile_id);
    if (byProfile) {
      return byProfile.id;
    }
  }

  if (!customer.account_manager) {
    return null;
  }

  const normalized = normalize(customer.account_manager);
  return (
    members.find((member) => normalize(member.email) === normalized)?.id ??
    members.find((member) => normalize(member.name) === normalized)?.id ??
    null
  );
}

function clampRate(value: number) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : DEFAULT_ADMIN_SETTINGS.default_commission_rate;
  return Math.max(0, Math.min(1, safe));
}

function normalize(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function minDate(left: string, right: string) {
  return left <= right ? left : right;
}

function maxDate(left: string, right: string) {
  return left >= right ? left : right;
}
