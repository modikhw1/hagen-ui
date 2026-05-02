'use client';

import { useRef } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Wallet } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Table, Button, Text, Group } from '@mantine/core';
import EmptyState from '@/components/admin/EmptyState';
import { formatSek } from '@/lib/admin/money';
import type { PayrollResponse } from '@/lib/admin/schemas/payroll';

type SortKey = 'billed_ore' | 'payout_ore' | 'billable_days';
type SortState = { key: SortKey; direction: 'asc' | 'desc' };

type Props = {
  customers: PayrollResponse['rows'][number]['customer_breakdown'];
  sort: SortState;
  onSortChange: (next: SortState) => void;
  isLoading?: boolean;
};

const VIRTUALIZE_THRESHOLD = 50;

function sortIcon(column: SortKey, sort: SortState) {
  if (sort.key !== column) {
    return <ArrowUpDown size={14} />;
  }

  if (sort.direction === 'asc') {
    return <ArrowDown size={14} />;
  }

  return <ArrowUp size={14} />;
}

export function PayrollCustomerRows({ customers, sort, onSortChange, isLoading = false }: Props) {
  const shouldVirtualize = customers.length > VIRTUALIZE_THRESHOLD;
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

  if (isLoading) {
    return <Text size="sm" c="dimmed" px="xs" py="md">Laddar kundunderlag...</Text>;
  }

  if (customers.length === 0) {
    return (
      <div className="pt-2">
        <EmptyState
          icon={Wallet}
          title="Inget billbart underlag"
          hint="Ingen kundaktivitet matchade den valda perioden för den här CM:n."
        />
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border">
      <Table verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr className="bg-secondary/40">
            <Table.Th w="45%">Kund</Table.Th>
            <Table.Th>
              <Button
                variant="subtle"
                size="compact-xs"
                color="gray"
                styles={{
                  root: {
                    height: 'auto',
                    padding: 0,
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  },
                  inner: {
                    justifyContent: 'flex-start',
                  }
                }}
                onClick={() =>
                  onSortChange({
                    key: 'billed_ore',
                    direction:
                      sort.key === 'billed_ore' && sort.direction === 'desc' ? 'asc' : 'desc',
                  })
                }
                rightSection={sortIcon('billed_ore', sort)}
              >
                Billat
              </Button>
            </Table.Th>
            <Table.Th>
              <Button
                variant="subtle"
                size="compact-xs"
                color="gray"
                styles={{
                  root: {
                    height: 'auto',
                    padding: 0,
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  },
                  inner: {
                    justifyContent: 'flex-start',
                  }
                }}
                onClick={() =>
                  onSortChange({
                    key: 'payout_ore',
                    direction:
                      sort.key === 'payout_ore' && sort.direction === 'desc' ? 'asc' : 'desc',
                  })
                }
                rightSection={sortIcon('payout_ore', sort)}
              >
                Payout
              </Button>
            </Table.Th>
            <Table.Th>
              <Button
                variant="subtle"
                size="compact-xs"
                color="gray"
                styles={{
                  root: {
                    height: 'auto',
                    padding: 0,
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  },
                  inner: {
                    justifyContent: 'flex-start',
                  }
                }}
                onClick={() =>
                  onSortChange({
                    key: 'billable_days',
                    direction:
                      sort.key === 'billable_days' && sort.direction === 'desc' ? 'asc' : 'desc',
                  })
                }
                rightSection={sortIcon('billable_days', sort)}
              >
                Dagar
              </Button>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        {shouldVirtualize ? null : (
          <Table.Tbody>
            {customers.map((customer) => (
              <Table.Tr key={customer.customer_id}>
                <Table.Td className="font-medium text-foreground">
                  <Group gap="xs">
                    {customer.customer_name}
                    {customer.pro_rata_label && (
                      <span className="inline-flex items-center rounded-full bg-status-info-bg px-1.5 py-0.5 text-[9px] font-bold text-status-info-fg uppercase tracking-tight">
                        {customer.pro_rata_label}
                      </span>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>{formatSek(customer.billed_ore)}</Table.Td>
                <Table.Td>{formatSek(customer.payout_ore)}</Table.Td>
                <Table.Td className="text-muted-foreground">{customer.billable_days}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        )}
      </Table>

      {shouldVirtualize ? (
        <div
          ref={parentRef}
          className="overflow-auto border-t border-border"
          style={{ maxHeight: '420px' }}
        >
          <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const customer = customers[virtualRow.index];
              if (!customer) {
                return null;
              }

              return (
                <div
                  key={customer.customer_id}
                  className="absolute left-0 top-0 grid w-full grid-cols-[45%_18%_18%_19%] border-b border-border px-4 py-3 text-sm"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <div className="font-medium text-foreground">
                    {customer.customer_name}
                    {customer.pro_rata_label && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-status-info-bg px-1.5 py-0.5 text-[9px] font-bold text-status-info-fg uppercase tracking-tight">
                        {customer.pro_rata_label}
                      </span>
                    )}
                  </div>
                  <div>{formatSek(customer.billed_ore)}</div>
                  <div>{formatSek(customer.payout_ore)}</div>
                  <div className="text-muted-foreground">{customer.billable_days}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
