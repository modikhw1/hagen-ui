import { useEffect } from 'react';
import { useLocation } from 'wouter';
export default function Page() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate('/admin/billing?view=subscriptions'); }, [navigate]);
  return null;
}
