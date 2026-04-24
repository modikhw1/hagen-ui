'use client';

import Link from 'next/link';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { deriveCustomerHeaderAlert } from '@/lib/admin-derive/customer-alert';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { cn } from '@/lib/utils';

export default function CustomerHeaderAttention({ customerId }: { customerId: string }) {
  const { data: customer } = useCustomerDetail(customerId);
  const alert = customer ? deriveCustomerHeaderAlert(customer) : null;

  if (!alert) return null;

  return (
    <Link
      href={alert.href}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold hover:opacity-90",
        alert.tone === 'danger' 
          ? "border-status-danger-fg/20 bg-status-danger-bg text-status-danger-fg"
          : "border-status-warning-fg/20 bg-status-warning-bg text-status-warning-fg"
      )}
    >
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        alert.tone === 'danger' ? "bg-status-danger-fg" : "bg-status-warning-fg"
      )} />
      {alert.label}
    </Link>
  );
}
