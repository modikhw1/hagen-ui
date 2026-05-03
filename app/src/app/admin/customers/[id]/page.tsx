import { redirect } from 'next/navigation';

import { CustomerDriftRoute } from '@/components/admin/customers/routes/CustomerDriftRoute';
import { loadCustomerView } from '@/lib/admin/server/customer-view';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CustomerDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const focus = getValue(query.focus);
  const invoice = getValue(query.invoice);

  if (invoice) {
    redirect(`/admin/customers/${id}/avtal/${invoice}`);
  }

  const focusMap: Record<string, string> = {
    contract: `/admin/customers/${id}/avtal`,
    invoices: `/admin/customers/${id}/avtal`,
    'upcoming-invoice': `/admin/customers/${id}/avtal`,
    pending: `/admin/customers/${id}/avtal`,
    operations: `/admin/customers/${id}`,
    cm: `/admin/customers/${id}#cm`,
    activity: `/admin/customers/${id}`,
    contact: `/admin/customers/${id}/avtal`,
    'tiktok-profile': `/admin/customers/${id}/avtal`,
    studio: `/admin/customers/${id}`,
    subscription: `/admin/customers/${id}/avtal`,
  };

  if (focus && focus in focusMap) {
    redirect(focusMap[focus]);
  }

  const data = await loadCustomerView(id);

  return (
    <CustomerDriftRoute
      customerId={id}
      overview={data.overview}
      pulse={data.pulse}
    />
  );
}
