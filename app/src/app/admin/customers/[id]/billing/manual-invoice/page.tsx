import CustomerBillingPage from '@/components/admin/customers/routes/CustomerBillingPage.server';
import CustomerManualInvoiceModalRoute from '@/components/admin/customers/routes/CustomerManualInvoiceModalRoute';

export default async function CustomerManualInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <CustomerBillingPage
      customerId={id}
      modal={<CustomerManualInvoiceModalRoute customerId={id} />}
    />
  );
}
