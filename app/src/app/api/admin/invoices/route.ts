import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';
import { getStripeEnvironment } from '@/lib/stripe/environment';
import { z } from 'zod';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  page: z.coerce.number().int().min(1).optional(),
  customerProfileId: z.string().uuid().optional(),
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
    status: url.searchParams.get('status') ?? undefined,
    environment: url.searchParams.get('environment') ?? undefined,
    includeLineItems: url.searchParams.get('includeLineItems') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Ogiltiga query-parametrar' }, { status: 400 });
  }

  const {
    limit = 50,
    page = 1,
    customerProfileId,
    status,
    includeLineItems = false,
  } = parsed.data;
  const environment = parsed.data.environment || getStripeEnvironment();
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const schemaWarnings: string[] = [];

  const buildInvoiceQuery = (withEnvironmentFilter: boolean) => {
    let query = supabaseAdmin
      .from('invoices')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (withEnvironmentFilter) {
      query = query.eq('environment', environment);
    }

    if (customerProfileId) {
      query = query.eq('customer_profile_id', customerProfileId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    return query;
  };

  let { data: invoices, error, count } = await buildInvoiceQuery(true);
  if (error && isMissingColumnError(error.message)) {
    schemaWarnings.push('Migration 040 saknas i databasen. Visar fakturor utan miljöfiltrering och utan garanterad test/live-separation.');
    const fallback = await buildInvoiceQuery(false);
    invoices = fallback.data;
    error = fallback.error;
    count = fallback.count;
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  return NextResponse.json({
    invoices: payload,
    environment,
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
