import CustomerSubscriptionPageContent from '@/components/admin/customers/routes/CustomerSubscriptionPage.server';

export default function CustomerSubscriptionRoute({
  customerId,
}: {
  customerId: string;
}) {
  return <CustomerSubscriptionPageContent customerId={customerId} />;
}
