'use client';

import { Suspense } from 'react';
import { CustomersPageClient } from '@/components/admin/customers/CustomersPageClient';
import { Skeleton } from '@mantine/core';
import { CUSTOMERS_PAGE_SIZE } from '@/lib/admin/customers/list.constants';

export default function CustomersPage() {
  return (
    <Suspense fallback={<CustomersTableSkeleton />}>
      <CustomersPageClient
        initialItems={[]}
        initialTotal={0}
        initialPageSize={CUSTOMERS_PAGE_SIZE}
      />
    </Suspense>
  );
}

function CustomersTableSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between gap-4'>
        <div className='space-y-2'>
          <Skeleton height={32} width={128} />
          <Skeleton height={16} width={96} />
        </div>
        <div className='flex gap-2'>
          <Skeleton height={40} width={112} radius='md' />
          <Skeleton height={40} width={128} radius='md' />
        </div>
      </div>
      <div className='flex flex-wrap gap-3'>
        <Skeleton height={40} width={288} radius='md' />
        <Skeleton height={40} width={256} radius='md' />
        <Skeleton height={40} width={144} radius='md' />
      </div>
    </div>
  );
}
