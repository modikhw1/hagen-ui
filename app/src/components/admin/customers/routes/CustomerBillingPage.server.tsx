import type { ReactNode } from 'react';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { getAdminActionSession } from '@/app/admin/_actions/shared';
import { qk } from '@/lib/admin/queryKeys';
import { fetchCustomerInvoicesServer } from '@/lib/admin/server/customer-billing';
import { fetchCustomerDetailServer } from '@/lib/admin/server/customer-subscription';
import CustomerBillingRoute from './CustomerBillingRoute';

export default async function CustomerBillingPage({
  customerId,
  modal,
}: {
  customerId: string;
  modal?: ReactNode;
}) {
  const queryClient = new QueryClient();
  const [_, customer, invoices] = await Promise.all([
    getAdminActionSession('customers.read'),
    fetchCustomerDetailServer(customerId),
    fetchCustomerInvoicesServer(customerId),
  ]);

  queryClient.setQueryData(qk.customers.detail(customerId), customer);
  queryClient.setQueryData(qk.customers.invoices(customerId), invoices);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CustomerBillingRoute customerId={customerId} />
      {modal}
    </HydrationBoundary>
  );
}
