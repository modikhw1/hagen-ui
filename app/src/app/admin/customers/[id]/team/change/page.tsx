import CustomerTeamRoute from '@/components/admin/customers/routes/CustomerTeamRoute';
import CustomerChangeCMRoute from '@/components/admin/customers/routes/CustomerChangeCMRoute';

export default async function CustomerTeamChangePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <CustomerTeamRoute customerId={id} />
      <CustomerChangeCMRoute customerId={id} />
    </>
  );
}
