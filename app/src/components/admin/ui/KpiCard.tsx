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
      "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/20 hover:shadow-sm",
      className
    )}>
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="text-muted-foreground group-hover:text-primary transition-colors">{icon}</div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        
        <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
        
        {delta && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
            <span className={cn(
              "font-semibold",
              delta.tone === 'success' ? "text-status-success-fg" : delta.tone === 'danger' ? "text-status-danger-fg" : "text-muted-foreground"
            )}>
              {delta.value}
            </span>
            <span className="text-muted-foreground">{delta.label}</span>
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-auto border-t border-border/50 bg-secondary/10 px-1 py-1">
          <Sparkline data={trend} height={28} className="opacity-50 group-hover:opacity-100 transition-opacity" />
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
