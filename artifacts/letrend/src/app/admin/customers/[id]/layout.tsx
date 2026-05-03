import type { ReactNode } from 'react';
import { useParams } from 'wouter';
import CustomerDetailTabs from '@/components/admin/customers/routes/CustomerDetailTabs';
import CustomerRealtimeBridge from '@/components/admin/customers/routes/CustomerRealtimeBridge';

type LayoutProps = {
  children: ReactNode;
};

export default function CustomerLayout({ children }: LayoutProps) {
  const { id } = useParams<{ id: string }>();
  if (!id) return <>{children}</>;

  return (
    <div className="space-y-6">
      <header className="sticky top-0 z-30 -mx-4 -mt-4 border-b border-border bg-background/95 px-4 pt-4 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6">
        <CustomerDetailTabs customerId={id} status={undefined} />
      </header>
      <CustomerRealtimeBridge customerId={id} />
      <main>
        {children}
      </main>
    </div>
  );
}
