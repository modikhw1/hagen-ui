import { loadCustomerView } from '@/lib/admin/server/customer-view';
import { CustomerDriftRoute } from '@/components/admin/customers/routes/CustomerDriftRoute';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CustomerDriftPage({ params }: PageProps) {
  const { id } = await params;
  const data = await loadCustomerView(id);

  return (
    <CustomerDriftRoute
      customerId={id}
      overview={data.overview}
      pulse={data.pulse}
    />
  );
}
