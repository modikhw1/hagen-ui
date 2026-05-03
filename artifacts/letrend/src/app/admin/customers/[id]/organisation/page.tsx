import { useParams } from 'wouter';
import { CustomerOrganisationRoute } from '@/components/admin/customers/routes/CustomerOrganisationRoute';
export default function CustomerOrganisationPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <CustomerOrganisationRoute customerId={id} initialData={null} />;
}
