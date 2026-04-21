'use client';

import { useParams } from 'next/navigation';
import CustomerDetailView from '@/components/admin/customers/CustomerDetailView';

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : null;

  if (!id) {
    return null;
  }

  return <CustomerDetailView id={id} />;
}
