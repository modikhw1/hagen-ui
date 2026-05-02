'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
};

export function AdminField({ 
  label, 
  htmlFor, 
  hint, 
  error, 
  required, 
  children,
  className 
}: Props) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-center justify-between gap-4">
        <label
          htmlFor={htmlFor}
          className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
        >
          {label}
          {required && <span className="ml-0.5 text-status-danger-fg">*</span>}
        </label>
        {hint && <span className="text-[10px] text-muted-foreground italic">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs text-status-danger-fg font-medium">{error}</p>}
    </div>
  );
}
