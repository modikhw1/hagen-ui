'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Skeleton } from '@mantine/core';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import type { LikeRateTier } from '@/lib/customer-detail/success';

export { bufferLabel, onboardingLabel } from '@/lib/admin/labels';

const likeRateTierClass: Record<LikeRateTier, string> = {
  poor: 'text-destructive',
  ok: 'text-status-warning-fg',
  good: 'text-status-success-fg',
  great: 'text-status-success-fg',
};

export function CustomerSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function CustomerField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

export function CustomerMetricCard({
  label,
  value,
  sub,
  title,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  title?: string;
  emphasis?: 'success' | 'warning' | 'danger' | 'info';
}) {
  const toneClass = 
    emphasis === 'success' ? 'text-status-success-fg' :
    emphasis === 'warning' ? 'text-status-warning-fg' :
    emphasis === 'danger'  ? 'text-status-danger-fg' :
    emphasis === 'info'    ? 'text-status-info-fg' : 
    'text-foreground';

  return (
    <div className="rounded-lg bg-secondary/50 p-3.5 border border-border/5 shadow-sm" title={title}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-base font-bold", toneClass)}>
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[10px] font-medium text-muted-foreground">
          {sub}
        </div>
      )}
    </div>
  );
}

export { StatusPill as CustomerStatusPill } from '@/components/admin/ui/StatusPill';

export function CustomerActionButton({
  children,
  onClick,
  disabled,
  href,
  className: customClassName,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
  className?: string;
}) {
  const className = cn(
    'block w-full rounded-md border border-border px-4 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50',
    customClassName,
  );

  if (href) {
    return (
      <Link href={href} scroll={false} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}

export function CustomerChecklistRow({
  label,
  done,
}: {
  label: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-foreground">{label}</span>
      <StatusPill
        label={done ? 'Klar' : 'Saknas'}
        tone={done ? 'success' : 'warning'}
        size="xs"
      />
    </div>
  );
}

export function CustomerRouteError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

export function CustomerRouteLoading({ label = 'Laddar kund...' }: { label?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <span className="sr-only">{label}</span>
      <div className="space-y-4">
        <Skeleton h={16} w={128} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton h={96} w="100%" radius="lg" />
          <Skeleton h={96} w="100%" radius="lg" />
        </div>
        <Skeleton h={128} w="100%" radius="lg" />
      </div>
    </div>
  );
}

export function CustomerSectionSkeleton({
  blocks = 3,
}: {
  blocks?: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton h={16} w={144} />
        <Skeleton h={32} w={96} radius="xl" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: blocks }, (_, index) => (
          <Skeleton key={index} h={64} w="100%" radius="lg" />
        ))}
      </div>
    </div>
  );
}
