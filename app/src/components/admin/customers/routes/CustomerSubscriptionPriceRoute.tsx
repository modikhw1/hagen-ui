'use client';

import { useRouter } from 'next/navigation';
import SubscriptionPriceChangeModal from '@/components/admin/billing/SubscriptionPriceChangeModal';
import { useCustomerBillingRefresh } from '@/hooks/admin/useAdminRefresh';

export default function CustomerSubscriptionPriceRoute({
  customerId,
  customerName,
  currentPriceSek,
}: {
  customerId: string;
  customerName: string;
  currentPriceSek: number | null;
}) {
  const router = useRouter();
  const refresh = useCustomerBillingRefresh(customerId);

  return (
    <SubscriptionPriceChangeModal
      open
      customerId={customerId}
      customerName={customerName}
      currentPriceSek={currentPriceSek}
      onClose={() => router.push(`/admin/customers/${customerId}/subscription`, { scroll: false })}
      onChanged={() => {
        void refresh();
      }}
    />
  );
}
