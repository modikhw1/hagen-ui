'use client';

import { shortDateSv } from '@/lib/admin/time';
import { formatSek } from '@/lib/admin/money';
import { cn } from '@/lib/utils';

export function discountSummary(customer: {
  discount_type?: string | null;
  discount_value?: number | null;
  discount_ends_at?: string | null;
}) {
  if (!customer.discount_type || customer.discount_type === 'none') return 'Ingen rabatt';
  
  const val = customer.discount_value ?? 0;
  const suffix = customer.discount_ends_at ? ` (t.o.m. ${shortDateSv(customer.discount_ends_at)})` : '';
  
  if (customer.discount_type === 'percent') return `${val}% rabatt${suffix}`;
  if (customer.discount_type === 'amount') return `${formatSek(val)} rabatt / mån${suffix}`;
  if (customer.discount_type === 'free_months') return `${val} gratis månader${suffix}`;
  
  return 'Aktiv rabatt';
}

export function DiscountPreview({ customer, className }: { customer: any, className?: string }) {
  const summary = discountSummary(customer);
  const active = customer.discount_type && customer.discount_type !== 'none';
  
  return (
    <div className={cn(
      "rounded-md px-3 py-2 text-sm",
      active ? "bg-status-success-bg text-status-success-fg border border-status-success-fg/20" : "bg-secondary text-muted-foreground border border-border",
      className
    )}>
      {summary}
    </div>
  );
}
