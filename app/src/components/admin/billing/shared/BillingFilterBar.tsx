'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BillingView = 'invoices' | 'subscriptions';

export function BillingFilterBar({
  view,
  onViewChange,
  status,
  onStatusChange,
  statusOptions,
  search,
  onSearchChange,
}: {
  view: BillingView;
  onViewChange: (view: BillingView) => void;
  status: string;
  onStatusChange: (status: string) => void;
  statusOptions: Array<{ key: string; label: string }>;
  search: string;
  onSearchChange: (search: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* View Toggle */}
        <div className="flex gap-0.5 rounded-md bg-secondary p-1">
          <button
            onClick={() => onViewChange('invoices')}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors",
              view === 'invoices' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Fakturor
          </button>
          <button
            onClick={() => onViewChange('subscriptions')}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors",
              view === 'subscriptions' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Abonnemang
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex gap-0.5 rounded-md bg-secondary p-1">
          {statusOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => onStatusChange(opt.key)}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-medium transition-colors text-nowrap",
                status === opt.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-xs w-full">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          placeholder="Sök kund..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
        />
      </div>
    </div>
  );
}
