'use client';

import Link from 'next/link';
import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ColumnAlign = 'left' | 'right' | 'center';

export type AdminTableColumn<T> = {
  key: string;
  header: string;
  width?: string;
  align?: ColumnAlign;
  render: (row: T) => ReactNode;
  linkable?: boolean;
  className?: string;
};

const alignClassName: Record<ColumnAlign, string> = {
  left: 'text-left justify-start',
  right: 'text-right justify-end',
  center: 'text-center justify-center',
};

function cellClassName(column: { align?: ColumnAlign; className?: string }) {
  return cn('flex min-w-0 items-center', alignClassName[column.align ?? 'left'], column.className);
}

export default function AdminTable<T>({
  columns,
  rows,
  getRowKey,
  emptyLabel,
  loadingRows = 0,
  onRowClick,
  rowHrefBuilder,
  gridTemplateColumns,
  density = 'comfortable',
  stickyHeader = false,
  stickyOffset,
  topContent,
  }: {
  columns: Array<AdminTableColumn<T>>;
  rows: T[];
  getRowKey: (row: T) => string;
  emptyLabel: ReactNode;
  loadingRows?: number;
  onRowClick?: (row: T) => void;
  rowHrefBuilder?: (row: T) => string | null;
  gridTemplateColumns?: string;
  density?: 'compact' | 'comfortable';
  stickyHeader?: boolean;
  stickyOffset?: string;
  topContent?: ReactNode;
  }) {
  const resolvedGrid =
    gridTemplateColumns || columns.map((column) => column.width ?? 'minmax(0,1fr)').join(' ');

  return (
    <div className="space-y-4">
      {topContent && (
        <div className="flex items-center justify-between px-1">
          {topContent}
        </div>
      )}
      <div
        className="overflow-hidden rounded-lg border border-border bg-card"
        style={{ ['--admin-table-columns' as string]: resolvedGrid }}
        role="table"
      >
        <div
          className={cn(
            "grid grid-cols-[var(--admin-table-columns)] gap-4 border-b border-border bg-secondary/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
            stickyHeader && "sticky z-10"
          )}
          style={stickyHeader && stickyOffset ? { top: stickyOffset } : undefined}
          role="row"
        >

          {columns.map((column) => (
            <div
              key={column.key}
              className={cn('flex items-center', alignClassName[column.align ?? 'left'])}
              role="columnheader"
            >
              {column.header}
            </div>
          ))}
        </div>

        {loadingRows > 0 ? (
          Array.from({ length: loadingRows }, (_, index) => (
            <AdminTableRow
              key={`loading-${index}`}
              columns={columns}
              density={density}
              className="motion-reduce:animate-none animate-pulse"
              renderCell={(column) => (
                <div
                  className={cn(
                    'h-4 rounded bg-secondary/60',
                    column.align === 'right' ? 'ml-auto w-16' : 'w-3/4',
                  )}
                />
              )}
            />
          ))
        ) : rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          rows.map((row) => {
            const href = rowHrefBuilder?.(row) ?? null;
            const onRowSelect = onRowClick ? () => onRowClick(row) : undefined;

            return (
              <AdminTableRow
                key={getRowKey(row)}
                columns={columns}
                density={density}
                clickable={Boolean(onRowSelect)}
                onClick={onRowSelect}
                renderCell={(column) => {
                  const content = <div className={cellClassName(column)}>{column.render(row)}</div>;

                  if (!href || column.linkable === false) {
                    return content;
                  }

                  return (
                    <Link
                      href={href}
                      className={cn(cellClassName(column), 'transition-colors hover:text-foreground')}
                    >
                      {column.render(row)}
                    </Link>
                  );
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function AdminTableRow<T>({
  columns,
  renderCell,
  onClick,
  clickable = false,
  className,
  density = 'comfortable',
}: {
  columns: Array<AdminTableColumn<T>>;
  renderCell: (column: AdminTableColumn<T>) => ReactNode;
  onClick?: () => void;
  clickable?: boolean;
  className?: string;
  density?: 'compact' | 'comfortable';
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable || !onClick) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  const rowPadding = density === 'compact' ? 'py-2' : 'py-3.5';

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={clickable ? 'button' : 'row'}
      tabIndex={clickable ? 0 : undefined}
      className={cn(
        'grid grid-cols-[var(--admin-table-columns)] gap-4 border-b border-border px-5 last:border-b-0',
        rowPadding,
        clickable && 'cursor-pointer hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {columns.map((column) => (
        <div key={column.key} className="min-w-0" role="cell">
          {renderCell(column)}
        </div>
      ))}
    </div>
  );
}
