import { DemosBoard } from '@/components/admin/demos/DemosBoard';
import { useSearchParams } from '@/lib/navigation-compat';

export default function DemosPage() {
  const [searchParams] = useSearchParams();
  const parsedDays = Number(searchParams.get('days') ?? 30);
  const days = Number.isFinite(parsedDays) && parsedDays >= 1 ? parsedDays : 30;
  return <DemosBoard days={days} />;
}
