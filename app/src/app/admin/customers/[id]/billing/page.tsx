import { redirect } from 'next/navigation';

export default async function CustomerBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ invoice?: string; manualInvoice?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const invoice = query?.invoice;
  const manualInvoice = query?.manualInvoice === '1' ? '?manualInvoice=1' : '';
  if (invoice) {
    redirect(`/admin/customers/${id}/avtal?invoice=${invoice}`);
  }
  redirect(`/admin/customers/${id}/avtal${manualInvoice}`);
}
