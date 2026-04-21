import CustomerInvoiceModalRoute from '@/components/admin/customers/routes/CustomerInvoiceModalRoute';

export default async function CustomerInvoiceModalPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  const { id, invoiceId } = await params;
  return <CustomerInvoiceModalRoute customerId={id} invoiceId={invoiceId} />;
}
