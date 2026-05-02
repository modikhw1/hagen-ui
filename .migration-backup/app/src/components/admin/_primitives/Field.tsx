import type { ReactNode } from 'react';
import { Label } from '@/components/admin/_primitives/Label';
import { cn } from '@/lib/utils';

type Props = {
  label: string;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
};

const AdminFieldPrimitive = ({
  label,
  children,
  className,
  labelClassName,
  htmlFor,
  hint,
  error,
}: Props) => {
  return (
    <label className={cn('grid gap-1.5 text-sm', className)} htmlFor={htmlFor}>
      <Label className={labelClassName}>{label}</Label>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
};

export { AdminFieldPrimitive as Field };
