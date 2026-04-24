'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import EmptyValue from '@/components/admin/_shared/EmptyValue';
import EmptyState from '@/components/admin/EmptyState';
import PendingInvoiceItems from '@/components/admin/customers/PendingInvoiceItems';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerInvoices } from '@/hooks/admin/useCustomerInvoices';
import { useCustomerPendingInvoiceItems } from '@/hooks/admin/useCustomerPendingInvoiceItems';
import { invoiceStatusLabel } from '@/lib/admin/labels';
import { formatPriceSEK, formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import { OPERATOR_COPY } from '@/lib/admin/copy/operator-glossary';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import {
  CustomerActionButton,
  CustomerRouteError,
  CustomerRouteLoading,
  CustomerSection,
} from './shared';

export default function CustomerBillingRoute({ customerId }: { customerId: string }) {
  const { data: customer, isLoading, error } = useCustomerDetail(customerId);
  const { data: invoices = [] } = useCustomerInvoices(customerId);
  const { data: pendingItems = [] } = useCustomerPendingInvoiceItems(customerId);

  if (isLoading) {
    return <CustomerRouteLoading label="Laddar fakturor..." />;
  }

  if (error || !customer) {
    return <CustomerRouteError message={error?.message || 'Kunden hittades inte.'} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
      <CustomerSection title="Fakturahistorik">
        {invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Inga fakturor ännu"
            hint="När de första fakturorna skapats visas historiken här."
          />
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/admin/customers/${customerId}/billing/${invoice.id}`}
                scroll={false}
                className="block overflow-hidden rounded-lg border border-border text-left transition-colors hover:border-primary/30"
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">
                      {typeof invoice.amount_due === 'number' ? (
                        formatSek(invoice.amount_due)
                      ) : (
                        <EmptyValue />
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {shortDateSv(invoice.created_at)}
                    </span>
                  </div>
                  <StatusPill 
                    label={invoice.status === 'paid' ? 'Betald' : invoice.status === 'open' ? 'Öppen' : invoiceStatusLabel(invoice.status)}
                    tone={invoice.status === 'paid' ? 'success' : invoice.status === 'open' ? 'warning' : 'neutral'}
                    size="xs"
                  />
                </div>
                {invoice.line_items && invoice.line_items.length > 0 ? (
                  <div className="border-t border-border bg-secondary/30 px-4 py-2">
                    {invoice.line_items.map((item, index) => (
                      <div
                        key={`${invoice.id}-${index}`}
                        className="flex justify-between py-1 text-xs"
                      >
                        <span className="text-muted-foreground">{item.description}</span>
                        <span className="font-medium text-foreground">{formatSek(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </CustomerSection>

      <div className="space-y-6">
        {customer.next_invoice_date && (customer.monthly_price ?? 0) > 0 ? (
          <CustomerSection
            title="Nästkommande faktura"
            action={
              <span className="text-xs text-muted-foreground">
                {shortDateSv(customer.next_invoice_date)}
              </span>
            }
          >
            <div className="rounded-md border border-border bg-secondary/30 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-foreground">Månadsabonnemang</span>
                <span className="font-medium text-foreground">
                  {formatPriceSEK(customer.monthly_price, { fallback: 'Ej satt' })}
                </span>
              </div>
            </div>
          </CustomerSection>
        ) : null}

        <CustomerSection 
          title={OPERATOR_COPY.pendingItems.sectionTitle}
        >
          <p className="mb-3 text-xs text-muted-foreground">
            {OPERATOR_COPY.pendingItems.sectionSubtitle(pendingItems.length, customer.next_invoice_date ? shortDateSv(customer.next_invoice_date) : '—')}
          </p>
          <PendingInvoiceItems customerId={customerId} />
        </CustomerSection>

        <CustomerSection title="Billing-åtgärder">
          <div className="space-y-2">
            <CustomerActionButton href={`/admin/customers/${customerId}/billing/manual-invoice`}>
              Skapa manuell faktura
            </CustomerActionButton>
          </div>
        </CustomerSection>
      </div>
    </div>
  );
}
