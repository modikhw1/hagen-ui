'use client';

import { Suspense, use } from 'react';
import { CustomerConceptDetailView } from '@/components/customer/CustomerConceptDetailView';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MobileConceptDetailPage({ params }: PageProps) {
  const { id } = use(params);

  return (
    <Suspense fallback={null}>
      <CustomerConceptDetailView assignmentId={id} variant="mobile" />
    </Suspense>
  );
}
