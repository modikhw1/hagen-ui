'use client';

import { cn } from '@/lib/utils';

export function EnvTag({ env, className }: { env?: string | null; className?: string }) {
  if (env !== 'test') return null;
  
  return (
    <span className={cn(
      "rounded-sm bg-status-warning-bg px-1 py-0.5 text-[9px] font-bold uppercase text-status-warning-fg border border-status-warning-fg/20",
      className
    )}>
      test
    </span>
  );
}
