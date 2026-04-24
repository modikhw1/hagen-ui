'use client';

import { useRouter } from 'next/navigation';
import ChangeCMModal from '@/components/admin/customers/modals/ChangeCMModal';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerAssignmentRefresh } from '@/hooks/admin/useAdminRefresh';
import { useTeamMembers } from '@/hooks/admin/useTeamMembers';

export default function CustomerChangeCMRoute({ customerId }: { customerId: string }) {
  const router = useRouter();
  const refresh = useCustomerAssignmentRefresh(customerId);
  const { data: customer } = useCustomerDetail(customerId);
  const { data: team = [] } = useTeamMembers();

  if (!customer) {
    return null;
  }

  return (
    <ChangeCMModal
      open
      customerId={customerId}
      currentCmId={customer.account_manager_profile_id}
      currentMonthlyPrice={customer.monthly_price}
      onOpenChange={() => router.push(`/admin/customers/${customerId}/team`, { scroll: false })}
      onChanged={() => {
        void refresh();
      }}
    />
  );
}
