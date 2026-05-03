import { useParams } from 'wouter';
import CustomerInvoiceModalRoute from '@/components/admin/customers/routes/CustomerInvoiceModalRoute';
export default function CustomerInvoiceModalPage() {
  const { id, invoiceId } = useParams<{ id: string; invoiceId: string }>();
  if (!id || !invoiceId) return null;
  return <CustomerInvoiceModalRoute customerId={id} invoiceId={invoiceId} />;
}
