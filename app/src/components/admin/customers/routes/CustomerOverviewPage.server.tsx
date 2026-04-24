import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { getAdminActionSession } from '@/app/admin/_actions/shared';
import { qk } from '@/lib/admin/queryKeys';
import { fetchCustomerTikTokStatsServer } from '@/lib/admin/server/customer-overview';
import { fetchCustomerDetailServer } from '@/lib/admin/server/customer-subscription';
import CustomerPulseRoute from './CustomerPulseRoute';

export default async function CustomerOverviewPage({
  customerId,
}: {
  customerId: string;
}) {
  const queryClient = new QueryClient();

  const [_, customer, tikTokStats] = await Promise.all([
    getAdminActionSession('customers.read'),
    fetchCustomerDetailServer(customerId),
    fetchCustomerTikTokStatsServer(customerId),
  ]);

  queryClient.setQueryData(qk.customers.detail(customerId), customer);
  queryClient.setQueryData(qk.customers.tiktok(customerId), tikTokStats);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CustomerPulseRoute customerId={customerId} />
    </HydrationBoundary>
  );
}
