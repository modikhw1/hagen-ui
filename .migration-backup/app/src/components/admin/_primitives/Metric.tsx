import { cn } from '@/lib/utils';

type Props = {
  label: string;
  value: string;
  className?: string;
};

const AdminMetric = ({ label, value, className }: Props) => {
  return (
    <div className={cn('rounded-md border border-border bg-background px-3 py-2', className)}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
};

export { AdminMetric as Metric };
