'use client';

import { useRouter } from 'next/navigation';
import SubscriptionPriceChangeModal from '@/components/admin/billing/SubscriptionPriceChangeModal';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerBillingRefresh } from '@/hooks/admin/useAdminRefresh';

export default function CustomerSubscriptionPriceRoute({
  customerId,
}: {
  customerId: string;
}) {
  const router = useRouter();
  const refresh = useCustomerBillingRefresh(customerId);
  const { data: customer } = useCustomerDetail(customerId);

  if (!customer) {
    return null;
  }

  return (
    <SubscriptionPriceChangeModal
      open
      customerId={customerId}
      customerName={customer.business_name}
      currentPriceSek={customer.monthly_price}
      onClose={() => router.push(`/admin/customers/${customerId}/subscription`, { scroll: false })}
      onChanged={() => {
        void refresh();
      }}
    />
  );
}
