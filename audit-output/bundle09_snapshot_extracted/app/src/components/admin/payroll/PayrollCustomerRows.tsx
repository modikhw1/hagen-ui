'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatSek } from '@/lib/admin/money';
import type { PayrollResponse } from '@/lib/admin/schemas/payroll';

type Props = {
  cmId: string;
  customers: PayrollResponse['rows'][number]['customer_breakdown'];
};

export function PayrollCustomerRows({ cmId, customers }: Props) {
  const shouldVirtualize = customers.length > 50;
  const parentRef = useRef<HTMLDivElement | null>(null);
  // TanStack Virtual exposes imperative helpers; React Compiler should not memoize this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: customers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 49,
    overscan: 8,
    enabled: shouldVirtualize,
  });

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-border bg-secondary/40 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div>Kund</div>
        <div>Billat</div>
        <div>Payout</div>
        <div>Dagar</div>
      </div>
      {customers.length === 0 ? (
        <div className="px-4 py-4 text-sm text-muted-foreground">
          Inget billbart underlag i vald period.
        </div>
      ) : shouldVirtualize ? (
        <div
          ref={parentRef}
          className="overflow-auto"
          style={{ maxHeight: '420px' }}
        >
          <div
            className="relative w-full"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const customer = customers[virtualRow.index];
              if (!customer) {
                return null;
              }

              return (
                <div
                  key={`${cmId}-${customer.customer_id}`}
                  className="absolute left-0 top-0 grid w-full grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-border px-4 py-3 text-sm last:border-b-0"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <div className="font-medium text-foreground">{customer.customer_name}</div>
                  <div className="text-foreground">{formatSek(customer.billed_ore)}</div>
                  <div className="text-foreground">{formatSek(customer.payout_ore)}</div>
                  <div className="text-muted-foreground">{customer.billable_days}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        customers.map((customer) => (
          <div
            key={`${cmId}-${customer.customer_id}`}
            className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-border px-4 py-3 text-sm last:border-b-0"
          >
            <div className="font-medium text-foreground">{customer.customer_name}</div>
            <div className="text-foreground">{formatSek(customer.billed_ore)}</div>
            <div className="text-foreground">{formatSek(customer.payout_ore)}</div>
            <div className="text-muted-foreground">{customer.billable_days}</div>
          </div>
        ))
      )}
    </div>
  );
}
