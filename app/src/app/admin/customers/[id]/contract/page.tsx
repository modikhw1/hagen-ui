import CustomerContractRoute from '@/components/admin/customers/routes/CustomerContractRoute';

export default async function CustomerContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerContractRoute customerId={id} />;
}
