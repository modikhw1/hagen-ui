import CustomerSubscriptionPriceRoute from '@/components/admin/customers/routes/CustomerSubscriptionPriceRoute';
import { fetchCustomerDetailServer } from '@/lib/admin/server/customer-subscription';

export default async function CustomerSubscriptionPriceModalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await fetchCustomerDetailServer(id);

  return (
    <CustomerSubscriptionPriceRoute
      customerId={id}
      customerName={customer.business_name}
      currentPriceSek={customer.monthly_price}
    />
  );
}
