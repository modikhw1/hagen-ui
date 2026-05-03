import { useEffect } from 'react';
import { useParams, useSearchParams } from '@/lib/navigation-compat';
import { useLocation } from 'wouter';

export default function CustomerBillingPage() {
  const { id } = useParams() as { id: string };
  const [searchParams] = useSearchParams();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!id) return;
    const invoice = searchParams?.get('invoice');
    const manualInvoice = searchParams?.get('manualInvoice') === '1' ? '?manualInvoice=1' : '';
    if (invoice) {
      navigate(`/admin/customers/${id}/avtal?invoice=${invoice}`, { replace: true });
    } else {
      navigate(`/admin/customers/${id}/avtal${manualInvoice}`, { replace: true });
    }
  }, [id, navigate, searchParams]);

  return null;
}
