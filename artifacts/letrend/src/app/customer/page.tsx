import { useEffect } from 'react';
import { useLocation } from 'wouter';
export default function CustomerRootPage() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate('/feed'); }, [navigate]);
  return null;
}
