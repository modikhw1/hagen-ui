import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

export async function syncInvoiceLineItems(params: {
  supabaseAdmin: SupabaseClient;
  invoiceId: string;
  lineItems: Stripe.InvoiceLineItem[];
  environment: 'test' | 'live';
}) {
  const { supabaseAdmin, invoiceId, lineItems, environment } = params;
  if (!lineItems.length) {
    return;
  }

  await supabaseAdmin
    .from('invoice_line_items')
    .upsert(
      lineItems.map((lineItem) => ({
        stripe_line_item_id: lineItem.id,
        stripe_invoice_id: invoiceId,
        stripe_invoice_item_id:
          typeof lineItem.invoice_item === 'string'
            ? lineItem.invoice_item
            : lineItem.invoice_item?.id || null,
        description: lineItem.description || '',
        amount: lineItem.amount || 0,
        currency: lineItem.currency || 'sek',
        quantity: lineItem.quantity || 1,
        period_start: lineItem.period?.start
          ? new Date(lineItem.period.start * 1000).toISOString()
          : null,
        period_end: lineItem.period?.end
          ? new Date(lineItem.period.end * 1000).toISOString()
          : null,
        data: lineItem,
        environment,
      })),
      { onConflict: 'stripe_line_item_id' }
    );
}
