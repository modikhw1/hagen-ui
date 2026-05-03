'use client';

import { Suspense, use } from 'react';
import { CustomerConceptDetailView } from '@/components/customer/CustomerConceptDetailView';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ConceptDetailPage({ params }: PageProps) {
  const { id } = use(params);

  return (
    <Suspense fallback={null}>
      <CustomerConceptDetailView assignmentId={id} variant="desktop" />
    </Suspense>
  );
}
