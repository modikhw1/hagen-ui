// app/src/components/admin/customers/routes/CustomerManualInvoiceModalRoute.tsx

'use client';

import { useRouter } from 'next/navigation';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { StandaloneInvoiceModal } from '@/components/admin/customers/modals/StandaloneInvoiceModal';

export default function CustomerManualInvoiceModalRoute({
  customerId,
}: {
  customerId: string;
}) {
  const router = useRouter();
  const { data: customer } = useCustomerDetail(customerId);

  if (!customer) {
    return null;
  }

  return (
    <StandaloneInvoiceModal
      open={true}
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
      customerId={customerId}
      customerName={customer.business_name}
    />
  );
}
