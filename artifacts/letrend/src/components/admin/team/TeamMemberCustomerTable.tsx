'use client';

import { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import TeamCustomerRow from '@/components/admin/team/TeamCustomerRow';
import type { TeamMemberView } from '@/hooks/admin/useTeam';

const VIRTUALIZE_THRESHOLD = 75;
const VIRTUALIZED_HEIGHT_PX = 384;

type SortField = 'business_name' | 'monthly_price' | 'followers' | 'last_published_at' | 'flow';
type SortDirection = 'asc' | 'desc';

const STATUS_PRIORITY: Record<string, number> = {
  // Priority 0: Active & Healthy (Green)
  live_healthy: 0,
  active: 0,
  agreed: 0,
  // Priority 1: Attention needed (Warning/Brown)
  escalated: 1,
  live_underfilled: 1,
  onboarding_stuck: 1,
  // Priority 2: In progress (Info/Blue)
  invited: 2,
  pending: 2,
  // Priority 3: Paused (Muted)
  paused: 3,
  // Priority 4: Archived/Other
  archived: 4,
};

function getStatusPriority(status: string): number {
  return STATUS_PRIORITY[status] ?? STATUS_PRIORITY[status.toLowerCase()] ?? 5;
}

function getInitialSortDirection(field: SortField): SortDirection {
  return field === 'business_name' ? 'asc' : 'desc';
}

function getSortValue(
  customer: TeamMemberView['customers'][number],
  field: SortField,
) {
  switch (field) {
    case 'business_name': {
      const priority = getStatusPriority(customer.status);
      return `${priority}_${customer.business_name.toLocaleLowerCase('sv-SE')}`;
    }
    case 'monthly_price':
      return customer.monthly_price ?? 0;
    case 'followers':
      return customer.followers ?? -1;
    case 'last_published_at':
      return customer.last_published_at || customer.last_upload_at
        ? new Date(customer.last_published_at ?? customer.last_upload_at ?? '').getTime()
        : -1;
    case 'flow': {
      const publicationDate = customer.last_published_at ?? customer.last_upload_at;
      const isSynced = publicationDate || customer.followers > 0;
      
      if (!isSynced) {
        return -1; // Always at the bottom
      }

      // We need to re-calculate the dots logic here to ensure sort consistency with UI
      const expected = Math.min(7, Math.max(0, customer.expected_concepts_per_week ?? 0));
      const totalDots = expected > 0 ? expected : 1;
      const planned = Math.max(0, customer.planned_concepts_count ?? 0);
      const filledDots = Math.min(planned, totalDots);
      
      // Hierarchy: Synced (handled above) > totalDots (tempo) > filledDots (completion)
      // Using weight 100 for tempo ensures segments are grouped together.
      return (totalDots * 100) + filledDots;
    }
    default:
      return 0;
  }
}

function compareValues(
  left: string | number,
  right: string | number,
  direction: SortDirection,
) {
  if (typeof left === 'string' && typeof right === 'string') {
    return direction === 'asc' ? left.localeCompare(right, 'sv-SE') : right.localeCompare(left, 'sv-SE');
  }

  return direction === 'asc'
    ? Number(left) - Number(right)
    : Number(right) - Number(left);
}

export default function TeamMemberCustomerTable({
  customers,
}: {
  customers: TeamMemberView['customers'];
}) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const shouldVirtualize = customers.length > VIRTUALIZE_THRESHOLD;
  const parentRef = useRef<HTMLDivElement | null>(null);
  const sortedCustomers =
    sortField === null
      ? customers
      : [...customers]
          .map((customer, index) => ({ customer, index }))
          .sort((left, right) => {
            const compared = compareValues(
              getSortValue(left.customer, sortField),
              getSortValue(right.customer, sortField),
              sortDirection,
            );
            return compared !== 0 ? compared : left.index - right.index;
          })
          .map((entry) => entry.customer);

  const rowVirtualizer = useVirtualizer({
    count: sortedCustomers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 42,
    overscan: 8,
    enabled: shouldVirtualize,
  });

  function handleSort(field: SortField) {
    if (sortField !== field) {
      setSortField(field);
      setSortDirection(getInitialSortDirection(field));
      return;
    }

    if (sortDirection === getInitialSortDirection(field)) {
      setSortDirection(getInitialSortDirection(field) === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortField(null);
    setSortDirection('asc');
  }

  function SortIcon({ field }: { field: SortField }) {
    const isActive = sortField === field;
    if (!isActive) {
      return <ArrowUpDown size={12} className="ml-1 opacity-0 transition-opacity group-hover:opacity-50" />;
    }

    return sortDirection === 'asc'
      ? <ChevronUp size={12} className="ml-1 text-primary" />
      : <ChevronDown size={12} className="ml-1 text-primary" />;
  }

  if (customers.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-secondary/30 px-4 py-4 text-sm text-muted-foreground">
        Inga kunder tilldelade.
      </div>
    );
  }

  return (
    <div className="border-t border-border pt-3">
      <div className="mb-2 grid grid-cols-[2.2fr_1fr_1fr_1fr_1fr] gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <button
          type="button"
          onClick={() => handleSort('business_name')}
          className="group flex items-center text-left transition-colors hover:text-foreground"
          style={{ all: 'unset', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        >
          Kund <SortIcon field="business_name" />
        </button>
        <button
          type="button"
          onClick={() => handleSort('monthly_price')}
          className="group flex items-center justify-end text-right transition-colors hover:text-foreground"
          style={{ all: 'unset', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer' }}
        >
          MRR <SortIcon field="monthly_price" />
        </button>
        <button
          type="button"
          onClick={() => handleSort('followers')}
          className="group flex items-center justify-end text-right transition-colors hover:text-foreground"
          style={{ all: 'unset', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer' }}
        >
          Följare <SortIcon field="followers" />
        </button>
        <button
          type="button"
          onClick={() => handleSort('last_published_at')}
          className="group flex items-center justify-end text-right transition-colors hover:text-foreground"
          style={{ all: 'unset', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer' }}
        >
          Senast pub <SortIcon field="last_published_at" />
        </button>
        <button
          type="button"
          onClick={() => handleSort('flow')}
          className="group flex items-center justify-end text-right transition-colors hover:text-foreground"
          style={{ all: 'unset', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer' }}
        >
          Flöde <SortIcon field="flow" />
        </button>
      </div>

      {shouldVirtualize ? (
        <div className="space-y-2">
          <div
            ref={parentRef}
            aria-rowcount={sortedCustomers.length}
            className="overflow-auto rounded-md border border-border/60"
            style={{ height: `${VIRTUALIZED_HEIGHT_PX}px` }}
          >
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const customer = sortedCustomers[virtualRow.index];
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
          {sortedCustomers.map((customer) => (
            <TeamCustomerRow key={customer.id} customer={customer} />
          ))}
        </div>
      )}
    </div>
  );
}
