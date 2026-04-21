import CustomerActivityRoute from '@/components/admin/customers/routes/CustomerActivityRoute';

export default async function CustomerActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerActivityRoute customerId={id} />;
}
