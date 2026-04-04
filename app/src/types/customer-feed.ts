import type {
  CustomerConceptAssignmentStatus,
  CustomerConceptFeedStatus,
  CustomerConceptPlacementBucket,
} from '@/types/customer-lifecycle';

export type CustomerFeedBucket = CustomerConceptPlacementBucket;
export type CustomerFeedStatus = CustomerConceptFeedStatus;

/** Placement boundary: where the slot sits in the customer's plan. */
export interface CustomerFeedPlacement {
  feedOrder: number;
  bucket: CustomerFeedBucket;
}

/** Result boundary: production and publication outcome for the slot. */
export interface CustomerFeedResult {
  sharedAt: string | null;
  producedAt: string | null;
  publishedAt: string | null;
  tiktokUrl: string | null;
}

export interface CustomerFeedSlot {
  assignmentId: string;
  assignmentStatus: CustomerConceptAssignmentStatus | null;
  title: string;
  summary: string;
  note: string | null;
  detailHint: string | null;
  status: CustomerFeedStatus;
  statusLabel: string;
  matchPercentage: number | null;
  hasScript: boolean;
  scriptPreview: string | null;
  productionNotes: string[];
  sourceUrl: string | null;
  /** Placement boundary sub-object. */
  placement: CustomerFeedPlacement;
  /** Result boundary sub-object. */
  result: CustomerFeedResult;
}

export interface CustomerFeedResponse {
  slots: CustomerFeedSlot[];
  generatedAt: string;
}
