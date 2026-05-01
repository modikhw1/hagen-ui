// app/src/lib/admin/server/customer-billing.ts
import 'server-only';

import { unstable_cache } from 'next/cache';
import {
  adminCustomerBillingTag,
  adminCustomerTag,
} from '@/lib/admin/cache-tags';
import {
  customerInvoicesPayloadSchema,
  type CustomerInvoice,
  type CreditNoteOperation,
} from '@/lib/admin/dtos/billing';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export async function loadCustomerInvoicesSnapshot(params: {
  customerId: string;
}): Promise<{ invoices: CustomerInvoice[]; operations: CreditNoteOperation[] }> {
  const supabaseAdmin = createSupabaseAdmin();

  const [rpcResult, opsResult] = await Promise.all([
    supabaseAdmin.rpc('admin_get_customer_invoices_with_lines' as any, {
      p_customer_id: params.customerId,
      p_limit: 50,
    }),
    supabaseAdmin.from('credit_note_operations').select('id, operation_type, status, requires_attention, attention_reason, error_message, source_invoice_id, amount_ore, created_at').eq('customer_profile_id', params.customerId).order('created_at', { ascending: false }).limit(20)
  ]);

  if (rpcResult.error) throw new Error(rpcResult.error.message || 'Kunde inte ladda fakturor');

  const rows = (rpcResult.data ?? []) as Array<any>;
  return customerInvoicesPayloadSchema.parse({
    invoices: rows.map((invoice) => ({
      id: invoice.id,
      stripe_invoice_id: invoice.stripe_invoice_id,
      amount_due: invoice.amount_due ?? 0,
      status: invoice.status ?? '',
      created_at: invoice.created_at ?? new Date(0).toISOString(),
      due_date: invoice.due_date,
      hosted_invoice_url: invoice.hosted_invoice_url,
      invoice_pdf: invoice.invoice_pdf,
      line_items: Array.isArray(invoice.line_items) ? invoice.line_items : [],
    })),
    operations: opsResult.data ?? [],
  }) as { invoices: CustomerInvoice[]; operations: CreditNoteOperation[] };
}

export async function fetchCustomerInvoicesServer(
  customerId: string,
): Promise<{ invoices: CustomerInvoice[]; operations: CreditNoteOperation[] }> {
  return unstable_cache(
    async () => loadCustomerInvoicesSnapshot({ customerId }),
    ['admin-customer-invoices-rsc-v2', customerId],
    {
      revalidate: 30,
      tags: [adminCustomerTag(customerId), adminCustomerBillingTag(customerId)],
    },
  )();
}