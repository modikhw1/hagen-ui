import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BillingInvoiceStatusFilter,
  BillingSubscriptionStatusFilter,
} from '@/lib/admin/billing';
import { intervalLabel } from '@/lib/admin/labels';
import type { Database, Tables } from '@/types/database';

export type InvoiceListParams = {
  limit: number;
  page: number;
  customerProfileId?: string;
  status?: BillingInvoiceStatusFilter;
  q?: string;
  fromDate?: string;
  toDate?: string;
  environment?: 'test' | 'live';
  includeLineItems: boolean;
};

export type SubscriptionListParams = {
  limit: number;
  page: number;
  status?: BillingSubscriptionStatusFilter;
  sort?: string;
  q?: string;
  fromDate?: string;
  toDate?: string;
  environment?: 'test' | 'live';
  customerProfileId?: string;
  stripeSubscriptionId?: string;
};

type InvoiceViewRow = Database['public']['Views']['v_admin_invoices']['Row'];
type SubscriptionViewRow = Database['public']['Views']['v_admin_subscriptions']['Row'];
type InvoiceLineItemRow = Tables<'invoice_line_items'>;

type InvoiceLineItemLookupRow = Pick<InvoiceLineItemRow, 'stripe_invoice_id'> &
  Partial<
    Pick<
      InvoiceLineItemRow,
      | 'stripe_line_item_id'
      | 'description'
      | 'amount'
      | 'currency'
      | 'quantity'
      | 'period_start'
      | 'period_end'
    >
  >;

type FilterableQuery = {
  eq: (column: string, value: unknown) => FilterableQuery;
  ilike: (column: string, value: string) => FilterableQuery;
  gte: (column: string, value: string) => FilterableQuery;
  lte: (column: string, value: string) => FilterableQuery;
};

function sanitizeSearchTerm(value: string) {
  return value.replace(/[%_]/g, '').trim();
}

function applyInvoiceFilters<T>(query: T, filters: InvoiceListParams) {
  let next = query as unknown as FilterableQuery;

  if (filters.environment) {
    next = next.eq('environment', filters.environment);
  }
  if (filters.customerProfileId) {
    next = next.eq('customer_profile_id', filters.customerProfileId);
  }
  if (filters.status && filters.status !== 'all') {
    next = next.eq(
      filters.status === 'partially_refunded' ? 'display_status' : 'status',
      filters.status,
    );
  }
  if (filters.q) {
    const searchTerm = sanitizeSearchTerm(filters.q);
    if (searchTerm) {
      next = next.ilike('customer_name', `%${searchTerm}%`);
    }
  }
  if (filters.fromDate) {
    next = next.gte('created_at', `${filters.fromDate}T00:00:00.000Z`);
  }
  if (filters.toDate) {
    next = next.lte('created_at', `${filters.toDate}T23:59:59.999Z`);
  }

  return next as T;
}

function applySubscriptionFilters<T>(query: T, filters: SubscriptionListParams) {
  let next = query as unknown as FilterableQuery;

  if (filters.environment) {
    next = next.eq('environment', filters.environment);
  }
  if (filters.status && filters.status !== 'all') {
    next =
      filters.status === 'expiring'
        ? next.eq('cancel_at_period_end', true)
        : next.eq('status', filters.status);
  }
  if (filters.customerProfileId) {
    next = next.eq('customer_profile_id', filters.customerProfileId);
  }
  if (filters.stripeSubscriptionId) {
    next = next.eq('stripe_subscription_id', filters.stripeSubscriptionId);
  }
  if (filters.q) {
    const searchTerm = sanitizeSearchTerm(filters.q);
    if (searchTerm) {
      next = next.ilike('customer_name', `%${searchTerm}%`);
    }
  }
  if (filters.fromDate) {
    next = next.gte('created', `${filters.fromDate}T00:00:00.000Z`);
  }
  if (filters.toDate) {
    next = next.lte('created', `${filters.toDate}T23:59:59.999Z`);
  }

  return next as T;
}

function deriveMrrOre(
  subscriptions: Array<{
    amount: number;
    interval: string | null;
    interval_count: number | null;
    status: string;
    cancel_at_period_end: boolean;
  }>,
) {
  return subscriptions
    .filter((subscription) => subscription.status === 'active' && !subscription.cancel_at_period_end)
    .reduce((sum, subscription) => {
      const interval = subscription.interval ?? 'month';
      const intervalCount = subscription.interval_count ?? 1;

      if (interval === 'year') {
        return sum + Math.round(subscription.amount / 12);
      }
      if (interval === 'quarter' || (interval === 'month' && intervalCount === 3)) {
        return sum + Math.round(subscription.amount / 3);
      }
      if (interval === 'month' && intervalCount > 1) {
        return sum + Math.round(subscription.amount / intervalCount);
      }
      if (interval === 'week') {
        return sum + Math.round((subscription.amount * 52) / 12);
      }

      return sum + subscription.amount;
    }, 0);
}

function resolvePageCount(total: number, limit: number) {
  return total > 0 ? Math.ceil(total / limit) : 0;
}

import { unstable_cache } from 'next/cache';
import { billingInvoicesTag } from './cache-tags';

export async function listAdminInvoices(params: {
  supabaseAdmin: SupabaseClient<Database>;
  filters: InvoiceListParams;
}) {
  const { supabaseAdmin, filters } = params;
  
  // Create a cache key based on filters
  const cacheKey = JSON.stringify(filters);
  const env = filters.environment ?? 'all';

  return unstable_cache(
    async () => {
      const from = (filters.page - 1) * filters.limit;
      const to = from + filters.limit - 1;

      const listQuery = applyInvoiceFilters(
        supabaseAdmin
          .from('v_admin_invoices')
          .select(
            'id, stripe_invoice_id, customer_profile_id, stripe_customer_id, amount_due, amount_paid, subtotal_ore, tax_ore, total_ore, status, environment, created_at, due_date, hosted_invoice_url, customer_name, currency, refunded_ore, refund_state, display_status, invoice_number, payment_intent_id, dispute_status',
            { count: 'exact' },
          )
          .order('created_at', { ascending: false })
          .range(from, to),
        filters,
      );

      const summaryQuery = applyInvoiceFilters(
        supabaseAdmin
          .from('v_admin_invoices_summary' as any)
          .select('total_amount_due, total_amount_paid, display_status, status, invoice_count'),
        filters,
      );

      const [listResult, summaryResult] = await Promise.all([listQuery, summaryQuery]);
      if (listResult.error) throw new Error(listResult.error.message);
      if (summaryResult.error) throw new Error(summaryResult.error.message);

      const rows = (listResult.data ?? []) as unknown as InvoiceViewRow[];
      const summaryRows = (summaryResult.data ?? []) as unknown as any[];

      const stripeInvoiceIds = rows
        .map((row) => row.stripe_invoice_id)
        .filter((value): value is string => Boolean(value));

      const lineItemCountsByInvoiceId = new Map<string, number>();
      if (stripeInvoiceIds.length > 0) {
         const { data: lineCounts } = await supabaseAdmin
            .from('invoice_line_items')
            .select('stripe_invoice_id')
            .in('stripe_invoice_id', stripeInvoiceIds);
         
         for (const item of (lineCounts ?? [])) {
           lineItemCountsByInvoiceId.set(
             item.stripe_invoice_id,
             (lineItemCountsByInvoiceId.get(item.stripe_invoice_id) ?? 0) + 1
           );
         }
      }

      const total = listResult.count ?? 0;

      return {
        invoices: rows.map((row) => ({
          id: row.id ?? '',
          stripe_invoice_id: row.stripe_invoice_id ?? null,
          customer_profile_id: row.customer_profile_id ?? null,
          stripe_customer_id: row.stripe_customer_id ?? null,
          amount_due: row.amount_due ?? 0,
          amount_paid: row.amount_paid ?? 0,
          status: row.status ?? '',
          environment: row.environment ?? null,
          created_at: row.created_at ?? new Date(0).toISOString(),
          due_date: row.due_date ?? null,
          hosted_invoice_url: row.hosted_invoice_url ?? null,
          customer_name: row.customer_name ?? 'Okand',
          currency: row.currency ?? 'sek',
          subtotal_ore: row.subtotal_ore ?? 0,
          tax_ore: row.tax_ore ?? 0,
          total_ore: row.total_ore ?? Math.max(row.amount_paid ?? 0, row.amount_due ?? 0),
          invoice_number: row.invoice_number ?? null,
          payment_intent_id: row.payment_intent_id ?? null,
          dispute_status: row.dispute_status ?? null,
          refunded_ore: row.refunded_ore ?? 0,
          refund_state: row.refund_state ?? null,
          display_status: row.display_status ?? row.status ?? '',
          line_item_count: row.stripe_invoice_id
            ? lineItemCountsByInvoiceId.get(row.stripe_invoice_id) ?? 0
            : 0,
        })),
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total,
          pageCount: resolvePageCount(total, filters.limit),
        },
        summary: {
          openOre: summaryRows.reduce((s, r) => (r.display_status === 'open' ? s + r.total_amount_due : s), 0),
          paidOre: summaryRows.reduce((s, r) => (r.display_status === 'paid' ? s + r.total_amount_paid : s), 0),
          partiallyRefundedCount: summaryRows.reduce((s, r) => (r.display_status === 'partially_refunded' ? s + r.invoice_count : s), 0),
          invoicesNeedingActionCount: summaryRows.reduce((s, r) => (['open', 'past_due', 'uncollectible'].includes(r.display_status) ? s + r.invoice_count : s), 0),
          totalCount: summaryRows.reduce((s, r) => s + r.invoice_count, 0),
        }
      };
    },
    ['listAdminInvoices', cacheKey],
    { tags: [billingInvoicesTag(env)], revalidate: 3600 }
  )();
}

export async function listAdminSubscriptions(params: {
  supabaseAdmin: SupabaseClient<Database>;
  filters: SubscriptionListParams;
}) {
  const { supabaseAdmin, filters } = params;
  const from = (filters.page - 1) * filters.limit;
  const to = from + filters.limit - 1;

  let query = supabaseAdmin
    .from('v_admin_subscriptions')
    .select(
      'id, customer_profile_id, stripe_customer_id, stripe_subscription_id, status, amount, currency, interval, interval_count, created, current_period_start, current_period_end, cancel_at_period_end, canceled_at, environment, customer_name',
      { count: 'exact' },
    );

  // Apply sorting
  if (filters.sort) {
    const lastUnderscoreIndex = filters.sort.lastIndexOf('_');
    const field = filters.sort.substring(0, lastUnderscoreIndex);
    const direction = filters.sort.substring(lastUnderscoreIndex + 1);
    const ascending = direction === 'asc';
    
    if (field === 'status') {
      // Sort by status and then by cancel_at_period_end to group "Aktiv" and "Avslutas" logically
      query = query
        .order('status', { ascending })
        .order('cancel_at_period_end', { ascending });
    } else {
      const dbField = field === 'customer' ? 'customer_name' : 
                      field === 'price' ? 'amount' :
                      field === 'since' ? 'created' :
                      field === 'next_payment' ? 'current_period_end' :
                      field;
      
      query = query.order(dbField, { ascending });
    }
    
    // Always add a stable secondary sort if not already sorting by created
    if (field !== 'since') {
      query = query.order('created', { ascending: false });
    }
  } else {
    query = query.order('created', { ascending: false });
  }

  const listQuery = applySubscriptionFilters(
    query.range(from, to),
    filters,
  );

  // Optimized summary query using the new summary view with interval grouping
  const summaryQuery = applySubscriptionFilters(
    supabaseAdmin
      .from('v_admin_subscriptions_summary' as any)
      .select('total_amount, status, cancel_at_period_end, subscription_count, interval, interval_count'),
    filters,
  );

  const [listResult, summaryResult] = await Promise.all([listQuery, summaryQuery]);
  if (listResult.error) {
    throw new Error(listResult.error.message || 'Kunde inte hamta abonnemang');
  }
  if (summaryResult.error) {
    throw new Error(summaryResult.error.message || 'Kunde inte hamta abonnemangssummering');
  }

  const rows = (listResult.data ?? []) as unknown as SubscriptionViewRow[];
  const summaryRows = (summaryResult.data ?? []) as unknown as Array<{
    total_amount: number;
    status: string;
    cancel_at_period_end: boolean;
    subscription_count: number;
    interval: string | null;
    interval_count: number | null;
  }>;

  const subscriptions = rows.map((row) => ({
    id: row.id ?? '',
    customer_profile_id: row.customer_profile_id ?? null,
    stripe_customer_id: row.stripe_customer_id ?? null,
    stripe_subscription_id: row.stripe_subscription_id ?? null,
    status: row.status ?? '',
    amount: row.amount ?? 0,
    currency: row.currency ?? 'sek',
    interval: row.interval ?? null,
    interval_count: row.interval_count ?? 1,
    interval_label:
      (row.interval ?? 'month') === 'month' && (row.interval_count ?? 1) === 3
        ? '/kvartal'
        : intervalLabel(row.interval ?? 'month'),
    created: row.created ?? new Date(0).toISOString(),
    current_period_start: row.current_period_start ?? null,
    current_period_end: row.current_period_end ?? null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    canceled_at: row.canceled_at ?? null,
    environment: row.environment ?? null,
    customer_name: row.customer_name ?? 'Okand',
  }));

  const mrrOre = deriveMrrOre(
    summaryRows.map((row) => ({
      amount: row.total_amount,
      interval: row.interval,
      interval_count: row.interval_count,
      status: row.status,
      cancel_at_period_end: row.cancel_at_period_end,
    })),
  );

  const total = listResult.count ?? 0;

  return {
    subscriptions,
    summary: {
      activeCount: summaryRows
        .filter((row) => row.status === 'active' && !row.cancel_at_period_end)
        .reduce((sum, row) => sum + row.subscription_count, 0),
      expiringCount: summaryRows
        .filter((row) => row.cancel_at_period_end)
        .reduce((sum, row) => sum + row.subscription_count, 0),
      pastDueCount: summaryRows
        .filter((row) => row.status === 'past_due')
        .reduce((sum, row) => sum + row.subscription_count, 0),
      mrrOre,
    },
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      pageCount: resolvePageCount(total, filters.limit),
      hasNextPage: from + rows.length < total,
      hasPreviousPage: filters.page > 1,
    },
  };
}
