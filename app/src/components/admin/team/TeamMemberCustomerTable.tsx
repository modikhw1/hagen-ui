'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import TeamCustomerRow from '@/components/admin/team/TeamCustomerRow';
import { teamCopy } from '@/lib/admin/copy/team';
import type { TeamMemberView } from '@/hooks/admin/useTeam';

const VIRTUALIZE_THRESHOLD = 75;
const VIRTUALIZED_HEIGHT_PX = 384;

export default function TeamMemberCustomerTable({
  customers,
}: {
  customers: TeamMemberView['customers'];
}) {
  const shouldVirtualize = customers.length > VIRTUALIZE_THRESHOLD;
  const parentRef = useRef<HTMLDivElement | null>(null);
  
  const rowVirtualizer = useVirtualizer({
    count: customers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 42,
    overscan: 8,
    enabled: shouldVirtualize,
  });

  if (customers.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-secondary/30 px-4 py-4 text-sm text-muted-foreground">
        Inga kunder tilldelade.
      </div>
    );
  }

  return (
    <div className="border-t border-border pt-3">
      <div className="mb-2 grid grid-cols-[2.2fr_1fr_1fr_1fr_0.8fr] gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <div>Kund</div>
        <div className="text-right">MRR</div>
        <div className="text-right">Följare</div>
        <div className="text-right text-nowrap">Senast pub</div>
        <div className="text-right">Flöde</div>
      </div>

      {shouldVirtualize ? (
        <div className="space-y-2">
          <div
            ref={parentRef}
            aria-rowcount={customers.length}
            className="overflow-auto rounded-md border border-border/60"
            style={{ height: `${VIRTUALIZED_HEIGHT_PX}px` }}
          >
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const customer = customers[virtualRow.index];
                return (
                  <TeamCustomerRow
                    key={customer.id}
                    customer={customer}
                    className="absolute left-0 top-0 w-full"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {customers.map((customer) => (
            <TeamCustomerRow key={customer.id} customer={customer} />
          ))}
        </div>
      )}
    </div>
  );
}
