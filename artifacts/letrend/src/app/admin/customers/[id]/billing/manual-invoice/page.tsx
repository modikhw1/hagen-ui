import { useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  useEffect(() => { if (id) navigate(`/admin/customers/${id}/billing?manualInvoice=1`); }, [id, navigate]);
  return null;
}
