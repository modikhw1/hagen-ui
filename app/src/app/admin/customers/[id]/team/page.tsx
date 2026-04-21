import CustomerTeamRoute from '@/components/admin/customers/routes/CustomerTeamRoute';

export default async function CustomerTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerTeamRoute customerId={id} />;
}
