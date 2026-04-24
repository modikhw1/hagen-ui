import { Suspense } from 'react';
import CustomerOperationsPage from '@/components/admin/customers/routes/CustomerOperationsPage.server';
import { CustomerSectionSkeleton } from '@/components/admin/customers/routes/shared';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<CustomerSectionSkeleton blocks={6} />}>
      <CustomerOperationsPage customerId={id} />
    </Suspense>
  );
}
