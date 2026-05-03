import { useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
export default function Page() {
  const { id, invoiceId } = useParams<{ id: string; invoiceId: string }>();
  const [, navigate] = useLocation();
  useEffect(() => { if (id && invoiceId) navigate(`/admin/customers/${id}/billing?invoice=${invoiceId}`); }, [id, invoiceId, navigate]);
  return null;
}
