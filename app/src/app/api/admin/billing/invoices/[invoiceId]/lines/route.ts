import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ invoiceId: string }>;
}

export const GET = withAuth(async (_request, user, { params }: RouteParams) => {
  requireScope(user, 'billing.invoices.read');

  const { invoiceId } = await params;
  if (!invoiceId) {
    return jsonError('Faktura-ID krävs', 400);
  }

  const supabaseAdmin = createSupabaseAdmin();
  const invoiceResult = await supabaseAdmin
    .from('invoices')
    .select('id, stripe_invoice_id')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invoiceResult.error || !invoiceResult.data?.stripe_invoice_id) {
    return jsonError(invoiceResult.error?.message || 'Fakturan hittades inte', 404);
  }

  const lineItemsResult = await supabaseAdmin
    .from('invoice_line_items')
    .select('stripe_line_item_id, description, amount, currency, quantity, period_start, period_end')
    .eq('stripe_invoice_id', invoiceResult.data.stripe_invoice_id)
    .order('created_at', { ascending: true });

  if (lineItemsResult.error) {
    return jsonError(lineItemsResult.error.message || 'Kunde inte hämta fakturarader', 500);
  }

  return new Response(JSON.stringify({
    invoiceId,
    lineItems: (lineItemsResult.data ?? []).map((item) => ({
      stripe_line_item_id: item.stripe_line_item_id ?? null,
      description: item.description ?? 'Rad',
      amount: item.amount ?? 0,
      currency: item.currency ?? 'sek',
      quantity: item.quantity ?? 1,
      unit_amount_ore:
        item.quantity && item.quantity > 0 ? Math.round((item.amount ?? 0) / item.quantity) : null,
      period_start: item.period_start ?? null,
      period_end: item.period_end ?? null,
    })),
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=30',
    },
  });
}, ['admin']);
