'use client';

import { useRouter } from 'next/navigation';
import { InvoiceDetailModal } from '@/components/admin/billing/invoices/InvoiceDetailModal';
import { useCustomerBillingRefresh } from '@/hooks/admin/useAdminRefresh';

export default function CustomerInvoiceModalRoute({
  customerId,
  invoiceId,
}: {
  customerId: string;
  invoiceId: string;
}) {
  const router = useRouter();
  const refresh = useCustomerBillingRefresh(customerId);

  return (
    <InvoiceDetailModal
      invoiceId={invoiceId}
      open
      onClose={() => router.push(`/admin/customers/${customerId}/billing`, { scroll: false })}
      onUpdated={() => {
        void refresh();
      }}
    />
  );
}
