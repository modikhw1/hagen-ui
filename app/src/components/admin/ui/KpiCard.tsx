'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { Sparkline } from '@/components/admin/ui/chart/Sparkline';
import { cn } from '@/lib/utils';

export type KpiCardProps = {
  icon: ReactNode;
  label: string;
  value: string;
  delta?: { value: number | string; label: string; tone?: 'success' | 'danger' | 'neutral' };
  trend?: number[];
  href?: string;
  className?: string;
};

export default function KpiCard({
  icon,
  label,
  value,
  delta,
  trend,
  href,
  className,
}: KpiCardProps) {
  const content = (
    <div className={cn(
      "group relative flex flex-col rounded-lg border border-border bg-card transition-all hover:shadow-md",
      className
    )}>
      <div className="p-5 flex-1">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-muted-foreground">{icon}</div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
        </div>
        
        <div className="text-xl font-bold text-foreground">{value}</div>
        
        {delta && (
          <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold">
            <span className={cn(
              delta.tone === 'success' ? "text-status-success-fg" : delta.tone === 'danger' ? "text-status-danger-fg" : "text-muted-foreground"
            )}>
              {delta.value}
            </span>
            <span className="text-muted-foreground uppercase tracking-tight">{delta.label}</span>
          </div>
        )}
      </div>

      {trend && trend.length > 0 && (
        <div className="h-10 px-1 pb-1 opacity-40 group-hover:opacity-100 transition-opacity">
          <Sparkline data={trend} height={32} />
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
