import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function Page() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate('/admin/billing?view=invoices'); }, [navigate]);
  return null;
}
