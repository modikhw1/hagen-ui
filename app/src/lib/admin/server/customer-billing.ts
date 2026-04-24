import 'server-only';

import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adminCustomerBillingTag,
  adminCustomerTag,
} from '@/lib/admin/cache-tags';
import {
  customerInvoicesPayloadSchema,
  type CustomerInvoice,
} from '@/lib/admin/dtos/billing';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import type { Database } from '@/types/database';

type InvoiceRow = {
  id: string;
  stripe_invoice_id: string | null;
  amount_due: number | null;
  status: string | null;
  created_at: string | null;
  due_date: string | null;
  hosted_invoice_url: string | null;
};

type InvoiceLineItemRow = {
  stripe_invoice_id: string | null;
  description: string | null;
  amount: number | null;
};

export async function loadCustomerInvoicesSnapshot(params: {
  supabaseAdmin: SupabaseClient<Database>;
  customerId: string;
}): Promise<CustomerInvoice[]> {
  const { supabaseAdmin, customerId } = params;

  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select(
      'id, stripe_invoice_id, amount_due, status, created_at, due_date, hosted_invoice_url',
    )
    .eq('customer_profile_id', customerId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message || 'Kunde inte ladda fakturor');
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
      throw new Error(lineItemsError.message || 'Kunde inte ladda fakturarader');
    }

    for (const item of (lineItems ?? []) as InvoiceLineItemRow[]) {
      if (!item.stripe_invoice_id) {
        continue;
      }

      const group = lineItemsByInvoiceId.get(item.stripe_invoice_id) ?? [];
      group.push(item);
      lineItemsByInvoiceId.set(item.stripe_invoice_id, group);
    }
  }

  return customerInvoicesPayloadSchema.parse({
    invoices: ((invoices ?? []) as InvoiceRow[]).map((invoice) => ({
      id: invoice.id,
      stripe_invoice_id: invoice.stripe_invoice_id,
      amount_due: invoice.amount_due ?? 0,
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
  }).invoices;
}

export async function fetchCustomerInvoicesServer(
  customerId: string,
): Promise<CustomerInvoice[]> {
  return unstable_cache(
    async () =>
      loadCustomerInvoicesSnapshot({
        supabaseAdmin: createSupabaseAdmin(),
        customerId,
      }),
    ['admin-customer-invoices-rsc', customerId],
    {
      revalidate: 60,
      tags: [adminCustomerTag(customerId), adminCustomerBillingTag(customerId)],
    },
  )();
}
