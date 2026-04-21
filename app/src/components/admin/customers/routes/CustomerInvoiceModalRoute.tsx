'use client';

import { useRouter } from 'next/navigation';
import InvoiceOperationsModal from '@/components/admin/billing/InvoiceOperationsModal';
import { useCustomerRouteRefresh } from './useCustomerRouteRefresh';

export default function CustomerInvoiceModalRoute({
  customerId,
  invoiceId,
}: {
  customerId: string;
  invoiceId: string;
}) {
  const router = useRouter();
  const refresh = useCustomerRouteRefresh(customerId);

  return (
    <InvoiceOperationsModal
      invoiceId={invoiceId}
      open
      onClose={() => router.push(`/admin/customers/${customerId}/billing`, { scroll: false })}
      onUpdated={() => {
        void refresh();
      }}
    />
  );
}
