/**
 * Studio 2.0 TypeScript Types
 *
 * Type definitions for Studio 2.0 data architecture.
 * These types support the customer workspace, feed planner, and concept management.
 */

import type { TranslatedConcept } from '@/lib/conceptLoader';

// =====================================================
// Concept Content Overrides
// =====================================================

/**
 * Content overrides for customer-specific concept customization.
 * Allows storing custom headlines, scripts, target audiences, etc.
 */
export interface ConceptContentOverrides {
  headline?: string;
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

/**
 * customer_concepts table
 * Normalized representation of concepts assigned to customers
 */
export interface CustomerConcept {
  id: string;
  customer_id: string;
  concept_id: string;
  cm_id: string | null;

  // Status workflow
  status: 'draft' | 'sent' | 'produced' | 'archived';

  // Customization fields
  custom_script: string | null;
  why_it_fits: string | null;
  filming_instructions: string | null;
  tiktok_url: string | null;
  tiktok_thumbnail_url: string | null;
  tiktok_views: number | null;
  tiktok_likes: number | null;
  tiktok_comments: number | null;
  tiktok_watch_time_seconds: number | null;
  tiktok_last_synced_at: string | null;
  content_overrides: ConceptContentOverrides | null;

  // Feed planner
  feed_order: number | null;  // 0-centered: >0=future, 0=now, <0=history
  feed_slot: number | null;   // @deprecated - kept for backwards compatibility
  tags: string[];             // Array of tag names
  collection_id: string | null;
  cm_note: string | null;

  // Timestamps
  added_at: string;
  sent_at: string | null;
  produced_at: string | null;
  planned_publish_at: string | null;
  content_loaded_at: string | null;
  content_loaded_seen_at: string | null;
  published_at: string | null;
}

/**
 * customer_notes table
 * Chronological notes in Game Plan
 */
export interface CustomerNote {
  id: string;
  customer_id: string;
  cm_id: string;
  content: string;
  created_at: string;
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
export type Section = 'gameplan' | 'koncept' | 'feed' | 'kommunikation';

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
  status?: 'draft' | 'sent' | 'produced' | 'archived';
  feed_order?: number | null;
  feed_slot?: number | null;
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
 * Old customer_profiles.concepts JSON structure
 */
export interface OldCustomerConcept {
  concept_id: string;
  added_at: string;
  match_percentage: number;
  notes?: string;
  status: 'active' | 'paused' | 'completed';
  custom_headline?: string;
  custom_why_it_works?: string;
  custom_instructions?: string;
  custom_target_audience?: string;
}

/**
 * Status mapping from old to new system
 */
export const StatusMapping: Record<string, 'draft' | 'sent' | 'produced' | 'archived'> = {
  'active': 'draft',
  'paused': 'draft',
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
  rows: 2,
  currentSlotIndex: 3,
};

export interface CmTag {
  id: string;
  cm_id: string;
  name: string;
  color: string;
  created_at: string;
}

export type SlotType = 'planned' | 'current' | 'history' | 'empty';

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
