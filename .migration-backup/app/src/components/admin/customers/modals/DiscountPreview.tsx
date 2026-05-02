'use client';

import { shortDateSv } from '@/lib/admin/time';
import { formatSek } from '@/lib/admin/money';
import { cn } from '@/lib/utils';

type DiscountPreviewCustomer = {
  discount_type?: string | null;
  discount_value?: number | null;
  discount_end_date?: string | null;
  discount_ends_at?: string | null;
};

export function discountSummary(customer: DiscountPreviewCustomer) {
  if (!customer.discount_type || customer.discount_type === 'none') return 'Ingen rabatt';

  const value = customer.discount_value ?? 0;
  const endsAt = customer.discount_end_date || customer.discount_ends_at;
  const suffix = endsAt ? ` (t.o.m. ${shortDateSv(endsAt)})` : '';

  if (customer.discount_type === 'percent') return `${value}% rabatt${suffix}`;
  if (customer.discount_type === 'amount') return `${formatSek(value * 100)} rabatt / man${suffix}`;
  if (customer.discount_type === 'free_months') return `${value} gratis manader${suffix}`;

  return 'Aktiv rabatt';
}

export function DiscountPreview({
  customer,
  className,
}: {
  customer: DiscountPreviewCustomer;
  className?: string;
}) {
  const summary = discountSummary(customer);
  const active = customer.discount_type && customer.discount_type !== 'none';

  return (
    <div
      className={cn(
        'rounded-md px-3 py-2 text-sm',
        active
          ? 'bg-status-success-bg text-status-success-fg border border-status-success-fg/20'
          : 'bg-secondary text-muted-foreground border border-border',
        className,
      )}
    >
      {summary}
    </div>
  );
}
