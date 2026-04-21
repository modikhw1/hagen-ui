import CustomerSubscriptionRoute from '@/components/admin/customers/routes/CustomerSubscriptionRoute';

export default async function CustomerSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerSubscriptionRoute customerId={id} />;
}
