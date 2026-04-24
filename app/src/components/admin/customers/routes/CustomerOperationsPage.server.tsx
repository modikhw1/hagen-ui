import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { loadCustomerDetail } from '@/lib/admin/customer-detail/load';
import { qk } from '@/lib/admin/queryKeys';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { getAdminActionSession } from '@/app/admin/_actions/shared';
import CustomerOperationsRoute from './CustomerOperationsRoute';

export default async function CustomerOperationsPage({ customerId }: { customerId: string }) {
  const queryClient = new QueryClient();
  const supabaseAdmin = createSupabaseAdmin();
  
  const { user } = await getAdminActionSession('customers.read');

  await queryClient.prefetchQuery({
    queryKey: qk.customers.detail(customerId),
    queryFn: () => loadCustomerDetail({ supabaseAdmin, id: customerId, user }),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CustomerOperationsRoute customerId={customerId} />
    </HydrationBoundary>
  );
}
