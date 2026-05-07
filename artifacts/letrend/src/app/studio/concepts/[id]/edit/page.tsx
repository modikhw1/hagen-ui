'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from '@/lib/navigation-compat';

/**
 * Legacy concept edit page — quarantined Phase 52.
 *
 * This page previously rendered a full edit form including a `trendLevel`
 * number input and saved via PUT /api/admin/concepts/:id with `overrides.trendLevel`.
 * That field is no longer part of the enrich contract (removed in Hagen Phase 47).
 * The active edit flow is /studio/concepts/:id/review.
 *
 * Redirect is permanent for the session; old bookmarks will land on review.
 */
export default function LegacyConceptEditPage() {
  const params = useParams();
  const router = useRouter();
  const conceptId = params?.id as string;

  useEffect(() => {
    if (conceptId) {
      router.replace(`/studio/concepts/${conceptId}/review`);
    }
  }, [conceptId, router]);

  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
      Omdirigerar…
    </div>
  );
}
