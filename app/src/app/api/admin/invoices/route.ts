import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { z } from 'zod';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  page: z.coerce.number().int().min(1).optional(),
  customerProfileId: z.string().uuid().optional(),
  customer_profile_id: z.string().uuid().optional(),
  status: z.string().trim().min(1).optional(),
  environment: z.enum(['test', 'live']).optional(),
  includeLineItems: z.coerce.boolean().optional(),
}).strict();

function isMissingColumnError(message?: string | null) {
  return typeof message === 'string' && message.toLowerCase().includes('column') && message.toLowerCase().includes('does not exist');
}

function isMissingTableError(message?: string | null) {
  return typeof message === 'string' && message.toLowerCase().includes('relation') && message.toLowerCase().includes('does not exist');
}

export const GET = withAuth(async (request: NextRequest) => {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    customerProfileId: url.searchParams.get('customerProfileId') ?? undefined,
    customer_profile_id: url.searchParams.get('customer_profile_id') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    environment: url.searchParams.get('environment') ?? undefined,
    includeLineItems: url.searchParams.get('includeLineItems') ?? undefined,
  });

  if (!parsed.success) {
    return jsonError('Ogiltiga query-parametrar', 400);
  }

  const {
    limit = 50,
    page = 1,
    customerProfileId,
    customer_profile_id,
    status,
    includeLineItems = false,
  } = parsed.data;
  const resolvedCustomerProfileId = customer_profile_id || customerProfileId;
  const environment = parsed.data.environment;
  const supabaseAdmin = createSupabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const schemaWarnings: string[] = [];

  const buildInvoiceQuery = (withEnvironmentFilter: boolean) => {
    let query = supabaseAdmin
      .from('invoices')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (withEnvironmentFilter && environment) {
      query = query.eq('environment', environment);
    }

    if (resolvedCustomerProfileId) {
      query = query.eq('customer_profile_id', resolvedCustomerProfileId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    return query;
  };

  let { data: invoices, error, count } = await buildInvoiceQuery(Boolean(environment));
  if (error && isMissingColumnError(error.message)) {
    schemaWarnings.push('Migration 040 saknas i databasen. Visar fakturor utan miljöfiltrering och utan garanterad test/live-separation.');
    const fallback = await buildInvoiceQuery(false);
    invoices = fallback.data;
    error = fallback.error;
    count = fallback.count;
  }
  if (error) {
    return jsonError(error.message, 500);
  }

  const rows = invoices || [];
  const customerIds = [...new Set(rows.map((row) => row.customer_profile_id).filter(Boolean))];
  const stripeCustomerIds = [...new Set(rows.map((row) => row.stripe_customer_id).filter(Boolean))];

  const customerLookup = new Map<string, string>();
  const stripeCustomerLookup = new Map<string, string>();
  if (customerIds.length > 0 || stripeCustomerIds.length > 0) {
    const { data: customers } = await supabaseAdmin
      .from('customer_profiles')
      .select('id, business_name, stripe_customer_id');

    for (const customer of customers || []) {
      if (customer.id && customer.business_name) {
        customerLookup.set(customer.id, customer.business_name);
      }
      if (customer.stripe_customer_id && customer.business_name) {
        stripeCustomerLookup.set(customer.stripe_customer_id, customer.business_name);
      }
    }
  }

  const lineItemsByInvoiceId = new Map<string, unknown[]>();
  if (includeLineItems && rows.length > 0) {
    const invoiceIds = rows.map((row) => row.stripe_invoice_id).filter(Boolean);
    const { data: lineItems, error: lineItemsError } = await supabaseAdmin
      .from('invoice_line_items')
      .select('*')
      .in('stripe_invoice_id', invoiceIds);

    if (lineItemsError && isMissingTableError(lineItemsError.message)) {
      schemaWarnings.push('Tabellen invoice_line_items saknas. Kör migration 040 för att visa fakturarader i admin.');
    }

    for (const item of lineItems || []) {
      const group = lineItemsByInvoiceId.get(item.stripe_invoice_id) || [];
      group.push(item);
      lineItemsByInvoiceId.set(item.stripe_invoice_id, group);
    }
  }

  const payload = rows.map((invoice) => ({
    ...invoice,
    customer_name:
      (invoice.customer_profile_id && customerLookup.get(invoice.customer_profile_id)) ||
      stripeCustomerLookup.get(invoice.stripe_customer_id) ||
      invoice.stripe_customer_id?.slice(0, 18) ||
      'Okänd',
    line_items: lineItemsByInvoiceId.get(invoice.stripe_invoice_id) || [],
  }));

  return jsonOk({
    invoices: payload,
    environment: environment ?? 'all',
    schemaWarnings,
    pagination: {
      page,
      limit,
      total: count || 0,
      pageCount: Math.max(1, Math.ceil((count || 0) / limit)),
      hasNextPage: from + rows.length < (count || 0),
      hasPreviousPage: page > 1,
    },
  });
}, ['admin']);
