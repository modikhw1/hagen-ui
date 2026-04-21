import { withAuth, requireScope } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type InvoiceLineItemRow = {
  stripe_invoice_id: string | null;
  description: string | null;
  amount: number | null;
};

export const GET = withAuth(async (_request, user, { params }: RouteParams) => {
  requireScope(user, 'operations_admin');

  const { id } = await params;
  if (!id) {
    return jsonError('Kund-ID kravs', 400);
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select(
      'id, stripe_invoice_id, amount_due, status, created_at, due_date, hosted_invoice_url',
    )
    .eq('customer_profile_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return jsonError(error.message || 'Kunde inte ladda fakturor', 500);
  }

  const stripeInvoiceIds = (invoices ?? [])
    .map((invoice) => invoice.stripe_invoice_id)
    .filter((value): value is string => Boolean(value));

  const lineItemsByInvoiceId = new Map<string, InvoiceLineItemRow[]>();
  if (stripeInvoiceIds.length > 0) {
    const { data: lineItems, error: lineItemsError } = await supabaseAdmin
      .from('invoice_line_items')
      .select('stripe_invoice_id, description, amount')
      .in('stripe_invoice_id', stripeInvoiceIds);

    if (lineItemsError) {
      return jsonError(lineItemsError.message || 'Kunde inte ladda fakturarader', 500);
    }

    for (const item of (lineItems ?? []) as InvoiceLineItemRow[]) {
      if (!item.stripe_invoice_id) continue;
      const group = lineItemsByInvoiceId.get(item.stripe_invoice_id) ?? [];
      group.push(item);
      lineItemsByInvoiceId.set(item.stripe_invoice_id, group);
    }
  }

  return new Response(
    JSON.stringify({
      invoices: (invoices ?? []).map((invoice) => ({
        id: invoice.id,
        stripe_invoice_id: invoice.stripe_invoice_id,
        amount_due: invoice.amount_due,
        status: invoice.status ?? '',
        created_at: invoice.created_at ?? new Date(0).toISOString(),
        due_date: invoice.due_date,
        hosted_invoice_url: invoice.hosted_invoice_url,
        line_items: (
          invoice.stripe_invoice_id
            ? lineItemsByInvoiceId.get(invoice.stripe_invoice_id) ?? []
            : []
        ).map((item) => ({
          description: item.description ?? 'Rad',
          amount: item.amount ?? 0,
        })),
      })),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=10',
      },
    },
  );
}, ['admin']);
