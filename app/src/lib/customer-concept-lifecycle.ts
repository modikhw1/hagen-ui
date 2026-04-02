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
  value: CustomerConceptAssignmentStatus | null | undefined
): CustomerConceptRowStatus | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  switch (value) {
    case 'draft':
      return 'active';
    case 'sent':
      return 'paused';
    case 'produced':
      return 'completed';
    case 'archived':
    default:
      return value;
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
