import CustomerBillingPage from '@/components/admin/customers/routes/CustomerBillingPage.server';
import CustomerInvoiceModalRoute from '@/components/admin/customers/routes/CustomerInvoiceModalRoute';

export default async function CustomerInvoicePage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  const { id, invoiceId } = await params;

  return (
    <CustomerBillingPage
      customerId={id}
      modal={<CustomerInvoiceModalRoute customerId={id} invoiceId={invoiceId} />}
    />
  );
}
