import type {
  CustomerConceptAssignmentStatus,
  CustomerConceptPlacementBucket,
} from '@/types/customer-lifecycle';

export interface CustomerConceptMetadata {
  title: string;
  summary: string | null;
  script: string | null;
  why_it_fits: string | null;
  filming_guidance: string | null;
  production_checklist: string[];
  tags: string[];
}

export interface CustomerConceptAssignment {
  id: string;
  source_concept_id: string;
  concept_id: string;
  status: CustomerConceptAssignmentStatus | null;
  lifecycle_label: string | null;
  placement_bucket: CustomerConceptPlacementBucket | null;
  feed_order: number | null;
  placement_label: string | null;
  match_percentage: number | null;
  cm_note: string | null;
  added_at: string | null;
}

export interface CustomerConceptMedia {
  source_reference_url: string | null;
  reference_video_gcs_uri: string | null;
  published_clip_url: string | null;
  result_label: string | null;
}

export interface CustomerConceptDetailResponse {
  assignment: CustomerConceptAssignment;
  metadata: CustomerConceptMetadata;
  media: CustomerConceptMedia;
}
