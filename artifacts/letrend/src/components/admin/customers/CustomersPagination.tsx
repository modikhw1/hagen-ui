// app/src/components/admin/customers/CustomersPagination.tsx

'use client';

import { Button } from '@mantine/core';

interface CustomersPaginationProps {
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function CustomersPagination({
  currentPage,
  pageSize,
  total,
  onPageChange,
}: CustomersPaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(total, currentPage * pageSize);

  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4">
      <div className="text-xs text-muted-foreground">
        Visar {start}-{end} av {total} kunder
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            Föregående
          </Button>
          <div className="text-xs font-medium">
            Sida {currentPage} av {totalPages}
          </div>
          <Button
            variant="outline"
            size="xs"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Nästa
          </Button>
        </div>
      )}
    </div>
  );
}
