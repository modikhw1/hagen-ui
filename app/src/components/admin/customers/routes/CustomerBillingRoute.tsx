'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FileText } from 'lucide-react';
import EmptyState from '@/components/admin/EmptyState';
import ManualInvoiceModal from '@/components/admin/customers/modals/ManualInvoiceModal';
import PendingInvoiceItems from '@/components/admin/customers/PendingInvoiceItems';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerInvoices } from '@/hooks/admin/useCustomerInvoices';
import { formatSek, sekToOre } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import { useCustomerRouteRefresh } from '@/hooks/admin/useAdminRefresh';
import {
  CustomerActionButton,
  CustomerRouteError,
  CustomerRouteLoading,
  CustomerSection,
} from './shared';

export default function CustomerBillingRoute({ customerId }: { customerId: string }) {
  const { data: customer, isLoading, error } = useCustomerDetail(customerId);
  const { data: invoices = [] } = useCustomerInvoices(customerId);
  const refresh = useCustomerRouteRefresh(customerId);
  const [showManualInvoice, setShowManualInvoice] = useState(false);

  if (isLoading) {
    return <CustomerRouteLoading label="Laddar fakturor..." />;
  }

  if (error || !customer) {
    return <CustomerRouteError message={error?.message || 'Kunden hittades inte.'} />;
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
        <CustomerSection title="Fakturahistorik">
          {invoices.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Inga fakturor annu"
              hint="Nar de forsta fakturorna skapats visas historiken har."
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
                        {typeof invoice.amount_due === 'number' ? formatSek(invoice.amount_due) : '-'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {shortDateSv(invoice.created_at)}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        invoice.status === 'paid'
                          ? 'bg-success/10 text-success'
                          : invoice.status === 'open'
                            ? 'bg-warning/10 text-warning'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {invoice.status === 'paid'
                        ? 'Betald'
                        : invoice.status === 'open'
                          ? 'Opppen'
                          : invoice.status}
                    </span>
                  </div>
                  {invoice.line_items && invoice.line_items.length > 0 ? (
                    <div className="border-t border-border bg-secondary/30 px-4 py-2">
                      {invoice.line_items.map((item, index) => (
                        <div
                          key={`${invoice.id}-${index}`}
                          className="flex justify-between py-1 text-xs"
                        >
                          <span className="text-muted-foreground">{item.description}</span>
                          <span className="font-medium text-foreground">
                            {formatSek(item.amount)}
                          </span>
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
              title="Nastkommande faktura"
              action={<span className="text-xs text-muted-foreground">{shortDateSv(customer.next_invoice_date)}</span>}
            >
              <div className="space-y-4">
                <div className="rounded-md border border-border bg-secondary/30 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground">Manadsabonnemang</span>
                    <span className="font-medium text-foreground">
                      {formatSek(sekToOre(customer.monthly_price ?? 0))}
                    </span>
                  </div>
                </div>
                <PendingInvoiceItems customerId={customerId} />
              </div>
            </CustomerSection>
          ) : null}

          <CustomerSection title="Billing-atgarder">
            <div className="space-y-2">
              <CustomerActionButton onClick={() => setShowManualInvoice(true)}>
                Skapa manuell faktura
              </CustomerActionButton>
            </div>
          </CustomerSection>
        </div>
      </div>

      <ManualInvoiceModal
        open={showManualInvoice}
        customerId={customerId}
        customerName={customer.business_name}
        onClose={() => setShowManualInvoice(false)}
        onCreated={() => {
          setShowManualInvoice(false);
          void refresh();
        }}
      />
    </>
  );
}
