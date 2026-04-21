import CustomerSubscriptionRoute from '@/components/admin/customers/routes/CustomerSubscriptionRoute';
import CustomerSubscriptionPriceRoute from '@/components/admin/customers/routes/CustomerSubscriptionPriceRoute';

export default async function CustomerSubscriptionPricePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <CustomerSubscriptionRoute customerId={id} />
      <CustomerSubscriptionPriceRoute customerId={id} />
    </>
  );
}
