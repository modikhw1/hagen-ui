/**
 * Studio 2.0 TypeScript Types
 *
 * Type definitions for Studio 2.0 data architecture.
 * These types support the customer workspace, feed planner, and concept management.
 */

import type { TranslatedConcept } from '@/lib/conceptLoader';
import type {
  CustomerConceptAssignmentStatus,
  CustomerConceptPlacementBucket,
} from '@/types/customer-lifecycle';

// =====================================================
// Concept Content Overrides
// =====================================================

/**
 * Content overrides for customer-specific concept customization.
 * Allows storing custom headlines, scripts, target audiences, etc.
 */
export interface ConceptContentOverrides {
  headline?: string;
  summary?: string;
  script?: string;
  target_audience?: string;
  call_to_action?: string;
  why_it_fits?: string;
  filming_instructions?: string;
  [key: string]: unknown;
}

// =====================================================
// Database Tables
// =====================================================

export type CustomerConceptRowKind = 'assignment' | 'imported_history';

export interface CustomerConceptAssignmentBoundary {
  customer_concept_id: string;
  customer_id: string;
  cm_id: string | null;
  source_concept_id: string | null;
  has_source_concept: boolean;
  status: CustomerConceptAssignmentStatus;
  added_at: string | null;
}

export interface CustomerConceptContentBoundary {
  custom_script: string | null;
  why_it_fits: string | null;
  filming_instructions: string | null;
  content_overrides: ConceptContentOverrides | null;
}

export interface CustomerConceptPlacementBoundary {
  feed_order: number | null;
  bucket: CustomerConceptPlacementBucket | null;
}

export interface CustomerConceptResultBoundary {
  sent_at: string | null;
  produced_at: string | null;
  planned_publish_at: string | null;
  content_loaded_at: string | null;
  content_loaded_seen_at: string | null;
  published_at: string | null;
  tiktok_url: string | null;
  tiktok_thumbnail_url: string | null;
  tiktok_views: number | null;
  tiktok_likes: number | null;
  tiktok_comments: number | null;
  tiktok_watch_time_seconds: number | null;
  tiktok_last_synced_at: string | null;
}

export interface CustomerConceptReconciliationBoundary {
  linked_customer_concept_id: string | null;
  linked_by_cm_id: string | null;
  linked_at: string | null;
  is_reconciled: boolean;
  // Only set on enriched LeTrend historik cards. The ID of the imported TikTok clip
  // that this card's stats come from — used to call undo-reconciliation from the LeTrend side.
  reconciled_clip_id: string | null;
}

export interface CustomerConceptMarkerBoundary {
  tags: string[];
  collection_id: string | null;
  assignment_note: string | null;
  shared_at: string | null;
}

/**
 * customer_concepts table
 * App-level normalized representation of an assignment row or imported-history row
 */
interface CustomerConceptBase {
  id: string;
  customer_id: string;
  concept_id: string | null;
  cm_id: string | null;
  row_kind: CustomerConceptRowKind;
  updated_at: string | null;

  // Assignment workflow
  status: CustomerConceptAssignmentStatus;

  // Customization fields
  /** @deprecated Prefer `content.custom_script`. */
  custom_script: string | null;
  /** @deprecated Prefer `content.why_it_fits`. */
  why_it_fits: string | null;
  /** @deprecated Prefer `content.filming_instructions`. */
  filming_instructions: string | null;
  /** @deprecated Prefer `result.tiktok_url`. */
  tiktok_url: string | null;
  /** @deprecated Prefer `result.tiktok_thumbnail_url`. */
  tiktok_thumbnail_url: string | null;
  /** @deprecated Prefer `result.tiktok_views`. */
  tiktok_views: number | null;
  /** @deprecated Prefer `result.tiktok_likes`. */
  tiktok_likes: number | null;
  /** @deprecated Prefer `result.tiktok_comments`. */
  tiktok_comments: number | null;
  /** @deprecated Prefer `result.tiktok_watch_time_seconds`. */
  tiktok_watch_time_seconds: number | null;
  /** @deprecated Prefer `result.tiktok_last_synced_at`. */
  tiktok_last_synced_at: string | null;
  /** @deprecated Prefer `reconciliation.linked_customer_concept_id`. */
  reconciled_customer_concept_id: string | null;
  /** @deprecated Prefer `reconciliation.linked_by_cm_id`. */
  reconciled_by_cm_id: string | null;
  /** @deprecated Prefer `reconciliation.linked_at`. */
  reconciled_at: string | null;
  /** @deprecated Prefer `content.content_overrides`. */
  content_overrides: ConceptContentOverrides | null;
  partner_name: string | null;
  profile_name: string | null;
  profile_image_url: string | null;
  visual_variant: string | null;

  // Feed planner
  /** @deprecated Prefer `placement.feed_order`. */
  feed_order: number | null;  // 0-centered: >0=future, 0=now, <0=history
  /** @deprecated Prefer `markers.tags`. */
  tags: string[];             // Array of tag names
  /** @deprecated Prefer `markers.collection_id`. */
  collection_id: string | null;
  /** @deprecated Prefer `markers.assignment_note`. */
  cm_note: string | null;

  // Timestamps
  added_at: string;
  /** @deprecated Prefer `markers.shared_at`. */
  sent_at: string | null;
  /** @deprecated Prefer `result.produced_at`. */
  produced_at: string | null;
  /** @deprecated Prefer `result.planned_publish_at`. */
  planned_publish_at: string | null;
  /** @deprecated Prefer `result.content_loaded_at`. */
  content_loaded_at: string | null;
  /** @deprecated Prefer `result.content_loaded_seen_at`. */
  content_loaded_seen_at: string | null;
  /** @deprecated Prefer `result.published_at`. */
  published_at: string | null;

  assignment: CustomerConceptAssignmentBoundary;
  content: CustomerConceptContentBoundary;
  placement: CustomerConceptPlacementBoundary;
  result: CustomerConceptResultBoundary;
  reconciliation: CustomerConceptReconciliationBoundary;
  markers: CustomerConceptMarkerBoundary;
}

export interface AssignedCustomerConcept extends CustomerConceptBase {
  row_kind: 'assignment';
  concept_id: string;
  assignment: CustomerConceptAssignmentBoundary & {
    source_concept_id: string;
    has_source_concept: true;
  };
}

export interface ImportedHistoryCustomerConcept extends CustomerConceptBase {
  row_kind: 'imported_history';
  concept_id: null;
  assignment: CustomerConceptAssignmentBoundary & {
    source_concept_id: null;
    has_source_concept: false;
  };
}

export type CustomerConcept = AssignedCustomerConcept | ImportedHistoryCustomerConcept;

/**
 * customer_notes table
 * Chronological customer touchpoints, separate from the Game Plan document
 */
export type CustomerNoteType = 'update' | 'reference' | 'feedback' | 'milestone';

export interface CustomerNoteReference {
  kind: string;
  label?: string;
  url?: string;
  platform?: string;
  customer_concept_id?: string;
}

export interface CustomerNoteAttachment {
  kind: string;
  url?: string;
  caption?: string;
  storage_path?: string;
  file_name?: string;
  mime_type?: string;
}

export interface CustomerNote {
  id: string;
  customer_id: string;
  cm_id: string;
  content: string;
  content_html?: string | null;
  note_type?: CustomerNoteType;
  primary_customer_concept_id?: string | null;
  references?: CustomerNoteReference[];
  attachments?: CustomerNoteAttachment[];
  created_at: string;
  updated_at?: string | null;
}

/**
 * customer_game_plans table
 * Dedicated strategic document per customer
 */
export interface CustomerGamePlanDocument {
  id: string;
  customer_id: string;
  html: string;
  plain_text: string;
  editor_version: number;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CustomerGamePlanSummary {
  html: string;
  plain_text: string;
  editor_version: number;
  updated_at: string | null;
  source: 'customer_game_plans' | 'legacy_customer_profiles' | 'empty';
}

/**
 * email_log table
 * Communication history for emails sent to customers
 */
export interface EmailLogEntry {
  id: string;
  customer_id: string;
  cm_id: string;
  subject: string;
  body_html: string;
  concept_ids: string[];
  sent_at: string;
}

/**
 * email_jobs table
 * Async queue status for sending and error handling
 */
export type EmailJobStatus = 'queued' | 'processing' | 'sent' | 'failed' | 'canceled';

export interface EmailJobEntry {
  id: string;
  customer_id: string;
  cm_id: string;
  subject: string;
  body_html: string;
  concept_ids: string[];
  recipient_email: string;
  status: EmailJobStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * cm_library_visits table
 * Tracking of latest library visits per CM
 */
export interface CMLibraryVisit {
  cm_id: string;
  last_visit: string;
}

// =====================================================
// JSONB Structures
// =====================================================

/**
 * customer_profiles.brief column
 * Three fixed fields for customer brief
 */
export interface CustomerBrief {
  tone: string;             // Feeling & tone
  constraints: string;      // Constraints
  current_focus: string;    // Current focus
  posting_weekdays?: number[] | null; // Soft tempo cadence (0=Mon…6=Sun), display-only
}

// =====================================================
// Extended Types
// =====================================================

/**
 * customer_profiles table with brief
 */
export interface CustomerProfile {
  id: string;
  business_name: string;
  contact_email: string;
  customer_contact_name?: string;
  account_manager?: string;
  account_manager_profile_id?: string | null;
  monthly_price: number;
  status: 'pending' | 'active' | 'archived' | 'invited' | 'agreed';
  logo_url?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;

  // Studio 2.0 additions
  brief?: CustomerBrief;

  // TikTok profile identity
  tiktok_profile_url?: string | null;   // canonical: full profile URL (e.g. https://www.tiktok.com/@brand)
  tiktok_handle?: string | null;        // derived display value, normalized from tiktok_profile_url
  last_history_sync_at?: string | null;
  // Operation lock: non-null = mark-produced is in progress; frontend shows badge if >60s old
  pending_history_advance_at?: string | null;
  operation_lock_until?: string | null;

  created_at: string;
  updated_at?: string;
}

/**
 * Concept with customization
 * Combination of original concept + customer-specific customization
 */
export interface ConceptWithCustomization {
  concept: TranslatedConcept;
  customization: CustomerConcept | null;
}

// =====================================================
// UI-specific Types
// =====================================================

/**
 * Activity indicator events
 * Events shown in customer workspace activity indicator
 */
export interface ActivityEvent {
  type: 'email_sent' | 'concept_status_changed' | 'brief_updated' | 'note_added';
  date: string;
  description: string;
  color: 'green' | 'gray';
}

/**
 * Customer card for "My Customers" page
 */
export interface CustomerCard {
  customer: CustomerProfile;
  draftCount: number;
  lastEmailDate: string | null;
  statusSignal: {
    color: string;
    label: string;
  };
}

/**
 * Feed planner slot (DEPRECATED)
 * @deprecated Use the new FeedSlot interface defined in Feed Planner Types section
 */
export interface OldFeedSlot {
  slotNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  concept: CustomerConcept | null;
  type: 'upcoming' | 'current' | 'history';
}

/**
 * Section navigation
 */
export type Section = 'gameplan' | 'koncept' | 'feed' | 'kommunikation' | 'demo';

// =====================================================
// API Request/Response Types
// =====================================================

/**
 * Email sending request
 */
export interface SendEmailRequest {
  customer_id: string;
  subject: string;
  body_html: string;
  concept_ids: string[];
}

/**
 * Email sending response
 */
export interface SendEmailResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Add concept to customer request
 */
export interface AddConceptRequest {
  customer_id: string;
  concept_id: string;
}

/**
 * Update concept customization request
 */
export interface UpdateConceptRequest {
  id: string;
  custom_script?: string;
  why_it_fits?: string;
  filming_instructions?: string;
  tiktok_url?: string;
  tiktok_thumbnail_url?: string | null;
  tiktok_views?: number | null;
  tiktok_likes?: number | null;
  tiktok_comments?: number | null;
  tiktok_watch_time_seconds?: number | null;
  tiktok_last_synced_at?: string | null;
  reconciled_customer_concept_id?: string | null;
  reconciled_by_cm_id?: string | null;
  reconciled_at?: string | null;
  status?: CustomerConceptAssignmentStatus;
  feed_order?: number | null;
  tags?: string[];
  collection_id?: string | null;
  cm_note?: string | null;
  sent_at?: string;
  produced_at?: string;
  planned_publish_at?: string | null;
  content_loaded_at?: string | null;
  content_loaded_seen_at?: string | null;
  published_at?: string | null;
  content_overrides?: ConceptContentOverrides | Record<string, unknown> | null;
}

/**
 * Add note request
 */
export interface AddNoteRequest {
  customer_id: string;
  content: string;
  content_html?: string | null;
  note_type?: CustomerNoteType;
  primary_customer_concept_id?: string | null;
  references?: CustomerNoteReference[];
  attachments?: CustomerNoteAttachment[];
}

/**
 * Update brief request
 */
export interface UpdateBriefRequest {
  customer_id: string;
  brief: CustomerBrief;
}

// =====================================================
// Migration Types (for migrate-concepts-to-v2.ts)
// =====================================================

/**
 * Status mapping from old to new system
 */
export const StatusMapping: Record<string, CustomerConceptAssignmentStatus> = {
  'active': 'draft',
  'paused': 'sent',
  'completed': 'produced'
};

// =====================================================
// Feed Planner Types
// =====================================================

export interface GridConfig {
  columns: number;
  rows: number;
  currentSlotIndex: number;
}

export const DEFAULT_GRID_CONFIG: GridConfig = {
  columns: 3,
  rows: 3,
  currentSlotIndex: 4, // center of 3×3 — nu at position 5, kommande above, historik below
};

export interface CmTag {
  id: string;
  cm_id: string;
  name: string;
  color: string;
  created_at: string;
}

export type SlotType = 'planned' | 'current' | 'history' | 'empty' | 'brand_pad';

export interface FeedSlot {
  slotIndex: number;
  feedOrder: number;
  concept: CustomerConcept | null;
  type: SlotType;
}

export const PRESET_TAG_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#F97316',
  '#6B7280',
  '#4A2F18',
] as const;

export interface FeedSpan {
  id: string;
  customer_id: string;
  cm_id: string;
  frac_start: number;
  frac_end: number;
  start_feed_order?: number | null;
  end_feed_order?: number | null;
  climax: number | null;
  climax_date: string | null;
  color_index: number;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export const SPAN_COLOR_PALETTE = [
  { name: 'Valentine', color: '#EC4899' },
  { name: 'Halloween', color: '#F97316' },
  { name: 'Lunch promo', color: '#10B981' },
  { name: 'Summer', color: '#3B82F6' },
  { name: 'Autumn', color: '#A78BFA' },
  { name: 'Neutral', color: '#C4B5A0' },
] as const;
