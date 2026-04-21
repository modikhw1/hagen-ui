'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { LikeRateTier } from '@/lib/customer-detail/success';

const likeRateTierClass: Record<LikeRateTier, string> = {
  poor: 'text-destructive',
  ok: 'text-warning',
  good: 'text-success',
  great: 'text-success',
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
  emphasis = 'default',
}: {
  label: string;
  value: ReactNode;
  sub: string;
  title?: string;
  emphasis?: 'default' | 'success' | LikeRateTier;
}) {
  const valueClass =
    emphasis === 'default'
      ? 'text-foreground'
      : emphasis === 'success'
        ? 'text-success'
        : likeRateTierClass[emphasis];
  const subClass =
    emphasis === 'poor' || emphasis === 'ok' || emphasis === 'good' || emphasis === 'great'
      ? likeRateTierClass[emphasis]
      : 'text-muted-foreground';

  return (
    <div className="rounded-lg bg-secondary/50 p-3" title={title}>
      <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`font-heading text-xl font-bold ${valueClass}`}>{value}</div>
      <div className={`mt-0.5 text-[10px] ${subClass}`}>{sub}</div>
    </div>
  );
}

export function CustomerStatusPill({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}) {
  const className =
    tone === 'success'
      ? 'bg-success/10 text-success'
      : tone === 'warning'
        ? 'bg-warning/10 text-warning'
        : tone === 'danger'
          ? 'bg-destructive/10 text-destructive'
          : tone === 'info'
            ? 'bg-info/10 text-info'
            : 'bg-secondary text-muted-foreground';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

export function CustomerActionButton({
  children,
  onClick,
  disabled,
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
}) {
  const className =
    'block w-full rounded-md border border-border px-4 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50';

  if (href) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
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
      <span className={done ? 'text-success' : 'text-warning'}>
        {done ? 'Klar' : 'Saknas'}
      </span>
    </div>
  );
}

export function onboardingLabel(state: 'invited' | 'cm_ready' | 'live' | 'settled') {
  if (state === 'cm_ready') return 'CM-redo';
  if (state === 'live') return 'Live';
  if (state === 'settled') return 'Stabil';
  return 'Inviterad';
}

export function bufferLabel(status: 'ok' | 'thin' | 'under' | 'paused' | 'blocked') {
  if (status === 'ok') return 'Buffer ok';
  if (status === 'thin') return 'Tunn buffer';
  if (status === 'under') return 'Underfylld';
  if (status === 'blocked') return 'Buffrad men blockerad';
  return 'Pausad';
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
        <Skeleton className="h-4 w-32" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
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
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: blocks }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
