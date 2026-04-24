import CustomerBillingPageContent from '@/components/admin/customers/routes/CustomerBillingPage.server';

export default async function CustomerBillingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerBillingPageContent customerId={id} />;
}
