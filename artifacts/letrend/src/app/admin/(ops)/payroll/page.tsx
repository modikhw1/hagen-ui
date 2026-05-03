import { PayrollScreen } from '@/components/admin/payroll/PayrollScreen';
import { useSearchParams } from '@/lib/navigation-compat';
export default function PayrollPage() {
  const [searchParams] = useSearchParams();
  const periodKey = searchParams.get('period') ?? null;
  return <PayrollScreen periodKey={periodKey} />;
}
