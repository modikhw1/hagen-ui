// app/src/components/admin/customers/ExportCustomersLink.tsx

'use client';

import { Download } from 'lucide-react';
import type { CustomerListParams } from '@/lib/admin/customers/list.types';

interface ExportCustomersLinkProps {
  params: CustomerListParams;
}

export function ExportCustomersLink({ params }: ExportCustomersLinkProps) {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('q', params.search);
  if (params.filter !== 'all') searchParams.set('filter', params.filter);
  if (params.sort !== 'recent') searchParams.set('sort', params.sort);
  
  const href = `/api/admin/customers/export?${searchParams.toString()}`;

  return (
    <a
      href={href}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Download className="h-4 w-4" />
      Exportera CSV
    </a>
  );
}
