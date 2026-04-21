import CustomerBillingRoute from '@/components/admin/customers/routes/CustomerBillingRoute';

export default async function CustomerBillingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerBillingRoute customerId={id} />;
}
