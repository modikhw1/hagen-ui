import type { ReactNode } from 'react';
import CustomerDetailShell from '@/components/admin/customers/routes/CustomerDetailShell';

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ id: string }>;
};

export default async function CustomerLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  return <CustomerDetailShell customerId={id}>{children}</CustomerDetailShell>;
}
