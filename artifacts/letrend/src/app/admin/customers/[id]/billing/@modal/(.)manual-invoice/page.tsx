import { useParams } from 'wouter';
import CustomerManualInvoiceModalRoute from '@/components/admin/customers/routes/CustomerManualInvoiceModalRoute';
export default function CustomerManualInvoiceModalPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <CustomerManualInvoiceModalRoute customerId={id} />;
}
