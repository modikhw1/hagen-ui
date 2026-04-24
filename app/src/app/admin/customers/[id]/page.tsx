import { redirect } from 'next/navigation';
import CustomerOverviewPage from '@/components/admin/customers/routes/CustomerOverviewPage.server';

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
    contract:           `/admin/customers/${id}/operations#contract`,
    invoices:           `/admin/customers/${id}/billing`,
    "upcoming-invoice": `/admin/customers/${id}/billing#upcoming`,
    pending:            `/admin/customers/${id}/billing#pending`,
    operations:         `/admin/customers/${id}/operations`,
    cm:                 `/admin/customers/${id}/operations#cm`,
    activity:           `/admin/customers/${id}/activity`,
    contact:            `/admin/customers/${id}/operations#contact`,
    "tiktok-profile":   `/admin/customers/${id}#tiktok`,
    studio:             `/admin/customers/${id}#studio`,
    subscription:       `/admin/customers/${id}/operations#subscription`,
  };

  if (focus && focus in focusMap) {
    redirect(focusMap[focus]);
  }

  return <CustomerOverviewPage customerId={id} />;
}
