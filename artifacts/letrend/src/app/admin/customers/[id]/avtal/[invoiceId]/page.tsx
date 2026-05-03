'use client';
import { useEffect } from 'react';
import { useParams } from 'wouter';
import { useRouter } from '@/lib/navigation-compat';

export default function Page() {
  const { id = '', invoiceId = '' } = useParams<{ id: string; invoiceId: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/admin/customers/${id}/avtal?invoice=${invoiceId}`);
  }, [id, invoiceId]);
  return null;
}
