'use client';

import { useRouter } from 'next/navigation';
import ManualInvoiceModal from '@/components/admin/customers/modals/ManualInvoiceModal';
import { useCustomerBillingRefresh } from '@/hooks/admin/useAdminRefresh';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';

export default function CustomerManualInvoiceModalRoute({
  customerId,
}: {
  customerId: string;
}) {
  const router = useRouter();
  const refresh = useCustomerBillingRefresh(customerId);
  const { data: customer } = useCustomerDetail(customerId);

  return (
    <ManualInvoiceModal
      open
      customerId={customerId}
      customerName={customer?.business_name ?? ''}
      onClose={() => router.push(`/admin/customers/${customerId}/billing`, { scroll: false })}
      onCreated={() => {
        void refresh();
        router.push(`/admin/customers/${customerId}/billing`, { scroll: false });
      }}
    />
  );
}
