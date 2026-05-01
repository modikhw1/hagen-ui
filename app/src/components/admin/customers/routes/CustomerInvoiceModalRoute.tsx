'use client';

import { useRouter } from 'next/navigation';
import { InvoiceDetailModal } from '@/components/admin/billing/invoices/InvoiceDetailModal';

export default function CustomerInvoiceModalRoute({
  customerId,
  invoiceId,
}: {
  customerId: string;
  invoiceId: string;
}) {
  const router = useRouter();
  const onClose = () => router.push(`/admin/customers/${customerId}/billing`, { scroll: false });

  return (
    <InvoiceDetailModal
      invoiceId={invoiceId}
      customerId={customerId}
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    />
  );
}
