import { useEffect } from 'react';
import { useParams } from '@/lib/navigation-compat';
import { useLocation } from 'wouter';

export default function Page() {
  const { id, invoiceId } = useParams() as { id: string; invoiceId: string };
  const [, navigate] = useLocation();

  useEffect(() => {
    if (id && invoiceId) {
      navigate(`/admin/customers/${id}/avtal?invoice=${invoiceId}`, { replace: true });
    }
  }, [id, invoiceId, navigate]);

  return null;
}
