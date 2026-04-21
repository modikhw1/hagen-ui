import CustomerSubscriptionPriceRoute from '@/components/admin/customers/routes/CustomerSubscriptionPriceRoute';

export default async function CustomerSubscriptionPriceModalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerSubscriptionPriceRoute customerId={id} />;
}
