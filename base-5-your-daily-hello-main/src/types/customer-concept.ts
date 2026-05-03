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
  /** Canonical id of the source concept in the concept library. Null for imported-history rows. */
  source_concept_id: string | null;
  /** Legacy alias for source_concept_id — prefer source_concept_id in new code. */
  concept_id: string | null;
  status: CustomerConceptAssignmentStatus | null;
  lifecycle_label: string | null;
  match_percentage: number | null;
  cm_note: string | null;
  added_at: string | null;
}

/** Placement boundary: where the assignment sits in the customer's plan. */
export interface CustomerConceptPlacement {
  feed_order: number | null;
  bucket: CustomerConceptPlacementBucket | null;
  placement_label: string | null;
}

/** Result boundary: production and publication outcome for the assignment. */
export interface CustomerConceptResult {
  /** Timestamp when the assignment was first shared with the customer. */
  sent_at: string | null;
  produced_at: string | null;
  published_at: string | null;
  tiktok_url: string | null;
  result_label: string | null;
}

export interface CustomerConceptMedia {
  source_reference_url: string | null;
  reference_video_gcs_uri: string | null;
}

export interface CustomerConceptDetailResponse {
  /** Assignment identity and status. */
  assignment: CustomerConceptAssignment;
  /** Placement boundary: where this assignment sits in the customer's plan. */
  placement: CustomerConceptPlacement;
  /** Result boundary: production and publication outcome. */
  result: CustomerConceptResult;
  /** Content boundary: adapted text, script, and production guidance. */
  metadata: CustomerConceptMetadata;
  /** Source media references and result URL (compat — prefer placement/result above). */
  media: CustomerConceptMedia;
}

// ── List contract ─────────────────────────────────────────────────────────

/**
 * Assignment section for a customer concept list item.
 * Lighter than CustomerConceptAssignment — no deprecated placement fields
 * (those are in the top-level `placement` section).
 */
export interface CustomerConceptListAssignment {
  id: string;
  /** Canonical id of the source concept in the concept library. Null for imported-history rows. */
  source_concept_id: string | null;
  /** Legacy alias for source_concept_id — prefer source_concept_id in new code. */
  concept_id: string | null;
  status: CustomerConceptAssignmentStatus | null;
  lifecycle_label: string | null;
  match_percentage: number | null;
  cm_note: string | null;
  added_at: string | null;
}

/**
 * A single item in the customer concept list response.
 * Returned by GET /api/customer/concepts.
 *
 * Canonical read paths:
 *   assignment  — identity and lifecycle status
 *   placement   — where this assignment sits in the customer's plan
 *   result      — production and publication outcome
 *   metadata    — adapted content (title, summary, script, etc.) — same shape as detail
 */
export interface CustomerConceptListItem {
  /** Assignment identity and lifecycle status. */
  assignment: CustomerConceptListAssignment;
  /** Placement boundary: where this assignment sits in the customer's plan. */
  placement: CustomerConceptPlacement;
  /** Result boundary: production and publication outcome. */
  result: CustomerConceptResult;
  /** Pre-computed difficulty display label (e.g. "Lätt", "Medel", "Avancerat"). */
  difficulty_label: string;
  /**
   * Content boundary: adapted text, script, and production guidance.
   * Same shape as CustomerConceptDetailResponse.metadata — use this for parity reads.
   */
  metadata: CustomerConceptMetadata;
  /** Whether this concept was recently added to the library. */
  is_new: boolean;
}
