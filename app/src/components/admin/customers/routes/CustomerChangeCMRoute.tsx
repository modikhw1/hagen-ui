'use client';

import { useRouter } from 'next/navigation';
import ChangeCMModal from '@/components/admin/customers/modals/ChangeCMModal';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerRouteRefresh } from '@/hooks/admin/useAdminRefresh';
import { useTeamMembers } from '@/hooks/admin/useTeamMembers';

export default function CustomerChangeCMRoute({ customerId }: { customerId: string }) {
  const router = useRouter();
  const refresh = useCustomerRouteRefresh(customerId);
  const { data: customer } = useCustomerDetail(customerId);
  const { data: team = [] } = useTeamMembers();

  if (!customer) {
    return null;
  }

  return (
    <ChangeCMModal
      open
      customerId={customerId}
      currentCM={customer.account_manager}
      currentMonthlyPrice={customer.monthly_price}
      team={team}
      onClose={() => router.push(`/admin/customers/${customerId}/team`, { scroll: false })}
      onChanged={() => {
        void refresh();
      }}
    />
  );
}
