import type {
  CustomerConceptAssignmentStatus,
  CustomerConceptFeedStatus,
  CustomerConceptPlacementBucket,
} from '@/types/customer-lifecycle';

export type CustomerFeedBucket = CustomerConceptPlacementBucket;
export type CustomerFeedStatus = CustomerConceptFeedStatus;

export interface CustomerFeedSlot {
  assignmentId: string;
  customerConceptId: string;
  sourceConceptId: string | null;
  conceptId: string | null;
  assignmentStatus: CustomerConceptAssignmentStatus | null;
  feedOrder: number;
  bucket: CustomerFeedBucket;
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
  tiktokUrl: string | null;
  sharedAt: string | null;
  producedAt: string | null;
  publishedAt: string | null;
}

export interface CustomerFeedResponse {
  slots: CustomerFeedSlot[];
  generatedAt: string;
}
