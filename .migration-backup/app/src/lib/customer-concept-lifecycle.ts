import type {
  CustomerConceptAssignmentStatus,
  CustomerConceptFeedStatus,
  CustomerConceptPlacementBucket,
  CustomerConceptRowStatus,
} from '@/types/customer-lifecycle';

export type CustomerConceptLifecycleInput = {
  rawStatus?: string | null;
  feedOrder?: number | null;
  sentAt?: string | null;
  producedAt?: string | null;
  publishedAt?: string | null;
  publishedClipUrl?: string | null;
};

export function normalizeCustomerConceptAssignmentStatus(
  value: string | null | undefined
): CustomerConceptAssignmentStatus | null {
  if (!value) return null;

  switch (value) {
    case 'active':
      return 'draft';
    case 'paused':
      return 'sent';
    case 'completed':
      return 'produced';
    case 'draft':
    case 'sent':
    case 'produced':
    case 'archived':
      return value;
    default:
      return null;
  }
}

export function serializeCustomerConceptAssignmentStatus(
  value: CustomerConceptRowStatus | null | undefined
): CustomerConceptAssignmentStatus | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  return normalizeCustomerConceptAssignmentStatus(value) ?? null;
}

export function getCustomerConceptStatusAfterShare(
  value: string | null | undefined
): CustomerConceptAssignmentStatus {
  const normalized = normalizeCustomerConceptAssignmentStatus(value);

  switch (normalized) {
    case 'produced':
    case 'archived':
      return normalized;
    case 'sent':
      return 'sent';
    case 'draft':
    default:
      return 'sent';
  }
}

export function getCustomerConceptPlacementBucket(
  feedOrder: number | null | undefined
): CustomerConceptPlacementBucket | null {
  if (typeof feedOrder !== 'number') return null;
  if (feedOrder === 0) return 'current';
  return feedOrder > 0 ? 'upcoming' : 'history';
}

export function getCustomerConceptPlacementLabel(
  feedOrder: number | null | undefined,
  perspective: 'customer' | 'studio' = 'customer'
): string | null {
  const bucket = getCustomerConceptPlacementBucket(feedOrder);
  return getCustomerConceptPlacementBucketLabel(bucket, perspective);
}

export function getCustomerConceptPlacementBucketLabel(
  bucket: CustomerConceptPlacementBucket | null | undefined,
  perspective: 'customer' | 'studio' = 'customer'
): string | null {
  const suffix = perspective === 'studio' ? 'planen' : 'din plan';

  switch (bucket) {
    case 'current':
      return `Nu i ${suffix}`;
    case 'upcoming':
      return `Kommande i ${suffix}`;
    case 'history':
      return `Tidigare i ${suffix}`;
    default:
      return null;
  }
}

export function getStudioFeedOrderLabel(
  feedOrder: number | null | undefined
): string {
  if (typeof feedOrder !== 'number') {
    return 'Inte i plan';
  }

  if (feedOrder === 0) {
    return 'Nu-slot (0)';
  }

  if (feedOrder > 0) {
    return `Kommande slot (+${feedOrder})`;
  }

  return `Historikslot (${feedOrder})`;
}

export function getStudioFeedOrderDescription(
  feedOrder: number | null | undefined
): string {
  if (typeof feedOrder !== 'number') {
    return 'Inte placerad i kundens plan';
  }

  if (feedOrder === 0) {
    return 'Det som ska produceras nu';
  }

  if (feedOrder > 0) {
    return feedOrder === 1
      ? 'Nast upp i kundens plan'
      : `Ligger ${feedOrder} steg fram i kundens plan`;
  }

  return feedOrder === -1
    ? 'Senast publicerade historikklipp'
    : `Historik ${Math.abs(feedOrder)} steg bak`;
}

export function deriveCustomerFeedStatus(
  input: CustomerConceptLifecycleInput
): CustomerConceptFeedStatus {
  const assignmentStatus = normalizeCustomerConceptAssignmentStatus(input.rawStatus ?? null);
  const placementBucket = getCustomerConceptPlacementBucket(input.feedOrder ?? null);

  if (input.publishedAt || input.publishedClipUrl) {
    return 'published_clip';
  }

  if (input.producedAt || assignmentStatus === 'produced') {
    return 'produced_clip';
  }

  if (placementBucket === 'current') {
    return 'current_in_plan';
  }

  return 'planned';
}

export function getCustomerFeedStatusLabel(
  status: CustomerConceptFeedStatus
): string {
  switch (status) {
    case 'current_in_plan':
      return 'Aktuell nu';
    case 'produced_clip':
      return 'Producerad';
    case 'published_clip':
      return 'Publicerad';
    case 'planned':
    default:
      return 'Planerad';
  }
}

export function getCustomerConceptAssignmentLabel(
  status: CustomerConceptAssignmentStatus
): string {
  switch (status) {
    case 'draft':
      return 'Utkast';
    case 'sent':
      return 'Delad med kund';
    case 'produced':
      return 'Producerad';
    case 'archived':
      return 'Arkiverad';
    default:
      return status;
  }
}

export function getNextCustomerConceptAssignmentStatus(
  status: CustomerConceptAssignmentStatus
): CustomerConceptAssignmentStatus | null {
  switch (status) {
    case 'draft':
      return 'sent';
    case 'sent':
      return 'produced';
    case 'produced':
      return 'archived';
    case 'archived':
    default:
      return null;
  }
}

export function getCustomerConceptResultLabel(
  input: Pick<
    CustomerConceptLifecycleInput,
    'rawStatus' | 'producedAt' | 'publishedAt' | 'publishedClipUrl'
  >
): string | null {
  const status = deriveCustomerFeedStatus(input);

  if (status === 'published_clip') {
    return 'Publicerad video';
  }

  if (status === 'produced_clip') {
    return 'Producerad video';
  }

  return null;
}

export const getStudioAssignmentStatusLabel = getCustomerConceptAssignmentLabel;

// ── Boundary-specific write payload builders ───────────────────────────────

/**
 * Builds the result boundary payload for the mark-produced action.
 *
 * Boundary: result (produced/published timestamps, TikTok URL).
 * feed_order is NOT included here — the route is responsible for shifting
 * all other rows by -1 first, after which the produced row sits at -1
 * (the most-recent historik position, nearest to nu).
 */
export function buildMarkProducedPayload(input: {
  tiktok_url?: string | null;
  published_at?: string | null;
  now: string;
}): {
  status: CustomerConceptAssignmentStatus;
  produced_at: string;
  published_at: string | null;
  tiktok_url: string | null;
} {
  return {
    status: 'produced',
    produced_at: input.now,
    // Use the clip's real published_at when provided; fall back to now when URL is present
    // but date is unknown; null when no URL (concept produced but not yet published on TikTok).
    published_at: input.tiktok_url ? (input.published_at ?? input.now) : null,
    tiktok_url: input.tiktok_url ?? null,
  };
}

/**
 * Builds the markers boundary payload for an assignment share-marker update.
 *
 * Boundary: markers (shared_at / sent_at) + assignment status progression
 * after a customer email has been sent.
 */
export function buildAssignmentShareMarkerPayload(
  assignment: { status: string | null; sent_at: string | null },
  now: string
): {
  status: CustomerConceptAssignmentStatus | null;
  sent_at: string;
  updated_at: string;
} {
  return {
    status: serializeCustomerConceptAssignmentStatus(
      getCustomerConceptStatusAfterShare(assignment.status)
    ) ?? null,
    sent_at: assignment.sent_at ?? now,
    updated_at: now,
  };
}
