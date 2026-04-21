import CustomerBillingRoute from '@/components/admin/customers/routes/CustomerBillingRoute';
import CustomerInvoiceModalRoute from '@/components/admin/customers/routes/CustomerInvoiceModalRoute';

export default async function CustomerInvoicePage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  const { id, invoiceId } = await params;

  return (
    <>
      <CustomerBillingRoute customerId={id} />
      <CustomerInvoiceModalRoute customerId={id} invoiceId={invoiceId} />
    </>
  );
}
