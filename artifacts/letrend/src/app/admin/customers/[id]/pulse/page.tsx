import { useParams } from 'wouter';
import { CustomerPulseRoute } from '@/components/admin/customers/routes/CustomerPulseRoute';
export default function CustomerPulsePage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <CustomerPulseRoute customerId={id} initialData={null} overview={null} />;
}
