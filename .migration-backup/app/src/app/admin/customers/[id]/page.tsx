import { redirect } from 'next/navigation';
import { loadCustomerView } from '@/lib/admin/server/customer-view';
import { CustomerOverviewRoute } from '@/components/admin/customers/routes/CustomerOverviewRoute';

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
    redirect(`/admin/customers/${id}/billing/${invoice}`);
  }

  const focusMap: Record<string, string> = {
    contract:           `/admin/customers/${id}/organisation`,
    invoices:           `/admin/customers/${id}/billing`,
    "upcoming-invoice": `/admin/customers/${id}/billing`,
    pending:            `/admin/customers/${id}/billing`,
    operations:         `/admin/customers/${id}/pulse`,
    cm:                 `/admin/customers/${id}/pulse`,
    activity:           `/admin/customers/${id}/pulse`,
    contact:            `/admin/customers/${id}/organisation`,
    "tiktok-profile":   `/admin/customers/${id}/organisation`,
    studio:             `/admin/customers/${id}/pulse`,
    subscription:       `/admin/customers/${id}/billing`,
  };

  if (focus && focus in focusMap) {
    redirect(focusMap[focus]);
  }

  const data = await loadCustomerView(id);

  return (
    <CustomerOverviewRoute
      customerId={id}
      initialData={data.overview}
      pulseData={data.pulse}
    />
  );
}
