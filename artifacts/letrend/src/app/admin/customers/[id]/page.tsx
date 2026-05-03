import { useParams, useLocation } from 'wouter';
import { useSearchParams } from '@/lib/navigation-compat';
import { useEffect } from 'react';
import { CustomerOverviewRoute } from '@/components/admin/customers/routes/CustomerOverviewRoute';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [, navigate] = useLocation();

  const focus = searchParams.get('focus');
  const invoice = searchParams.get('invoice');

  useEffect(() => {
    if (invoice) {
      navigate(`/admin/customers/${id}/billing/${invoice}`);
      return;
    }

    const focusMap: Record<string, string> = {
      contract:           `/admin/customers/${id}/organisation`,
      invoices:           `/admin/customers/${id}/billing`,
      'upcoming-invoice': `/admin/customers/${id}/billing`,
      pending:            `/admin/customers/${id}/billing`,
      operations:         `/admin/customers/${id}/pulse`,
      cm:                 `/admin/customers/${id}/pulse`,
      activity:           `/admin/customers/${id}/pulse`,
      contact:            `/admin/customers/${id}/organisation`,
      'tiktok-profile':   `/admin/customers/${id}/organisation`,
      studio:             `/admin/customers/${id}/pulse`,
      subscription:       `/admin/customers/${id}/billing`,
    };

    if (focus && focus in focusMap) {
      navigate(focusMap[focus]);
    }
  }, [id, focus, invoice, navigate]);

  if (!id) return null;

  return (
    <CustomerOverviewRoute
      customerId={id}
      initialData={null}
      pulseData={null}
    />
  );
}
