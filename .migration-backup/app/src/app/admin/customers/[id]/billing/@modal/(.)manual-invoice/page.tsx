import CustomerManualInvoiceModalRoute from '@/components/admin/customers/routes/CustomerManualInvoiceModalRoute';

export default async function CustomerManualInvoiceModalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerManualInvoiceModalRoute customerId={id} />;
}
