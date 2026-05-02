import type { ReactNode } from 'react';
import CustomerDetailHeader from '@/components/admin/customers/routes/CustomerDetailHeader.server';
import CustomerDetailTabs from '@/components/admin/customers/routes/CustomerDetailTabs';
import CustomerRealtimeBridge from '@/components/admin/customers/routes/CustomerRealtimeBridge';
import { loadAdminCustomerHeader } from '@/lib/admin/customer-detail/load';

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ id: string }>;
};

export default async function CustomerLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  const headerData = await loadAdminCustomerHeader(id);

  return (
    <div className="space-y-6">
      <header className="sticky top-0 z-30 -mx-4 -mt-4 border-b border-border bg-background/95 px-4 pt-4 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6">
        <CustomerDetailHeader customerId={id} initialData={headerData} />
        <CustomerDetailTabs customerId={id} status={headerData.status} />
      </header>
      <CustomerRealtimeBridge customerId={id} />
      <main>
        {children}
      </main>
    </div>
  );
}
