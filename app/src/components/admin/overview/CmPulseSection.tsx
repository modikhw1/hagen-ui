'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import CmPulseRow from '@/components/admin/CmPulseRow';
import { CM_PREVIEW_COUNT } from '@/lib/admin-derive/constants';
import { sortCmRows } from '@/lib/admin-derive/cm-pulse';
import type { OverviewDerivedPayload } from '@/lib/admin/overview-types';
import { Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const sortedRows = useMemo(() => {
    const rowByCmId = new Map(rows.map((row) => [row.aggregate.cmId, row]));
    return sortCmRows(
      rows.map((row) => row.aggregate),
      currentSortMode,
    )
      .map((aggregate) => rowByCmId.get(aggregate.cmId))
      .filter((row): row is OverviewDerivedPayload['cmPulse'][number] => Boolean(row));
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
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={currentSortMode}
            onChange={(e) => setCurrentSortMode(e.target.value as any)}
            className="bg-transparent text-xs font-medium text-muted-foreground focus:outline-none hover:text-foreground cursor-pointer"
          >
            <option value="standard">Sortera: Standard</option>
            <option value="lowest_activity">Sortera: Lägst aktivitet</option>
          </select>
        </div>
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
