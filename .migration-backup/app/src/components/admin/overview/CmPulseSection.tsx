'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import CmPulseRow from '@/components/admin/CmPulseRow';
import { CM_PREVIEW_COUNT } from '@/lib/admin-derive/constants';
import { sortCmRows } from '@/lib/admin-derive/cm-pulse';
import type { OverviewDerivedPayload } from '@/lib/admin/overview-types';
import { ListFilter, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Menu, UnstyledButton } from '@mantine/core';

export default function CmPulseSection({
  rows,
  sortMode,
}: {
  rows: OverviewDerivedPayload['cmPulse'];
  sortMode: 'standard' | 'lowest_activity';
}) {
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentSortMode, setCurrentSortMode] = useState(sortMode);

  useEffect(() => {
    setCurrentSortMode(sortMode);
  }, [sortMode]);

  const expanded = searchParams?.get('cm') === 'all';
  
  const updateSortMode = (nextMode: 'standard' | 'lowest_activity') => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (nextMode === 'standard') {
      params.delete('sort');
    } else {
      params.set('sort', nextMode);
    }
    setCurrentSortMode(nextMode);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const sortedRows = useMemo(() => {
    // We sort the existing rows array which already contains { member, aggregate }
    return sortCmRows(rows, currentSortMode);
  }, [currentSortMode, rows]);

  const visibleRows = expanded ? sortedRows : sortedRows.slice(0, CM_PREVIEW_COUNT);
  const hasMore = sortedRows.length > CM_PREVIEW_COUNT;

  const updateExpandedState = (nextExpanded: boolean) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (nextExpanded) {
      params.set('cm', 'all');
    } else {
      params.delete('cm');
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">CM-puls</h2>
          <p className="text-xs text-muted-foreground">Arbetsbelastning senaste 7 dagarna</p>
        </div>
        
        <Menu position="bottom-end" shadow="md" width={220}>
          <Menu.Target>
            <UnstyledButton className="group flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-secondary/50">
              <ListFilter className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
              <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                {currentSortMode === 'standard' ? 'Sortering: Operativ status' : 'Sortering: Lägst aktivitet'}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
            </UnstyledButton>
          </Menu.Target>

          <Menu.Dropdown className="border-border bg-popover/95 backdrop-blur-sm">
            <Menu.Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sorteringsalternativ</Menu.Label>
            <Menu.Item 
              onClick={() => updateSortMode('standard')}
              className={cn(
                "text-xs",
                currentSortMode === 'standard' && "bg-accent font-semibold text-accent-foreground"
              )}
            >
              Operativ status (Högst prio)
            </Menu.Item>
            <Menu.Item 
              onClick={() => updateSortMode('lowest_activity')}
              className={cn(
                "text-xs",
                currentSortMode === 'lowest_activity' && "bg-accent font-semibold text-accent-foreground"
              )}
            >
              Lägst aktivitet
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>

      <div className="space-y-2">
        {visibleRows.map((row) => (
          <CmPulseRow
            key={row.member.id}
            name={row.member.name}
            avatarUrl={row.member.avatar_url}
            aggregate={row.aggregate}
          />
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => updateExpandedState(!expanded)}
          className="w-full rounded-lg border border-dashed border-border py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        >
          {expanded ? 'Visa färre' : `Visa alla ${sortedRows.length} CM:s`}
        </button>
      )}
    </section>
  );
}
