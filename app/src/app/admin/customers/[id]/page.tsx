import { redirect } from 'next/navigation';
import CustomerOverviewRoute from '@/components/admin/customers/routes/CustomerOverviewRoute';

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
    contract: `/admin/customers/${id}/contract`,
    invoices: `/admin/customers/${id}/billing`,
    'upcoming-invoice': `/admin/customers/${id}/billing`,
    operations: `/admin/customers/${id}`,
    cm: `/admin/customers/${id}/team`,
    activity: `/admin/customers/${id}/activity`,
    contact: `/admin/customers/${id}/contract`,
    'tiktok-profile': `/admin/customers/${id}`,
  };

  if (focus && focus in focusMap) {
    redirect(focusMap[focus]);
  }

  return <CustomerOverviewRoute customerId={id} />;
}
