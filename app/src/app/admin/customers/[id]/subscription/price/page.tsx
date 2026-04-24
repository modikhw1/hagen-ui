import CustomerSubscriptionPageContent from '@/components/admin/customers/routes/CustomerSubscriptionPage.server';
import CustomerSubscriptionPriceRoute from '@/components/admin/customers/routes/CustomerSubscriptionPriceRoute';
import {
  fetchCustomerDetailServer,
  fetchCustomerSubscriptionServer,
} from '@/lib/admin/server/customer-subscription';

export default async function CustomerSubscriptionPricePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await fetchCustomerDetailServer(id);
  const subscription = await fetchCustomerSubscriptionServer(id, customer.stripe_subscription_id);

  return (
    <>
      <CustomerSubscriptionPageContent
        customerId={id}
        customer={customer}
        subscription={subscription}
      />
      <CustomerSubscriptionPriceRoute
        customerId={id}
        customerName={customer.business_name}
        currentPriceSek={customer.monthly_price}
      />
    </>
  );
}
