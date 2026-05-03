import { useEffect } from 'react';
import { useParams } from '@/lib/navigation-compat';
import { useLocation } from 'wouter';

export default function Page() {
  const { id } = useParams() as { id: string };
  const [, navigate] = useLocation();

  useEffect(() => {
    if (id) navigate(`/admin/customers/${id}#cm`, { replace: true });
  }, [id, navigate]);

  return null;
}
