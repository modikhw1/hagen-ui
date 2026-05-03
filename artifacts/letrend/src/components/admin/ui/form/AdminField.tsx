'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function AdminField({
  label,
  children,
  htmlFor,
  hint,
  error,
  required,
  className,
}: {
  label: string;
  children: ReactNode;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-4">
        <label
          htmlFor={htmlFor}
          className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {label}
          {required && <span className="ml-0.5 text-status-danger-fg">*</span>}
        </label>
        {hint && <span className="text-[10px] text-muted-foreground italic">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs text-status-danger-fg">{error}</p>}
    </div>
  );
}
