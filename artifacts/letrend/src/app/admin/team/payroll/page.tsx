import { useEffect } from 'react';
import { useLocation } from 'wouter';
export default function TeamPayrollPage() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate('/admin/payroll'); }, [navigate]);
  return null;
}
