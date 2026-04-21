import CustomerChangeCMRoute from '@/components/admin/customers/routes/CustomerChangeCMRoute';

export default async function CustomerChangeCMModalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerChangeCMRoute customerId={id} />;
}
