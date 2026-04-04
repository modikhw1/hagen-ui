import type { CustomerConceptAssignmentStatus } from '@/types/customer-lifecycle';

/**
 * Feed Planner Types
 *
 * Type definitions for the Feed Planner feature which allows
 * content managers to organize concepts into a visual timeline grid.
 */

// =====================================================
// Grid Configuration
// =====================================================

export interface GridConfig {
  columns: number;
  rows: number;
  currentSlotIndex: number;
}

export const DEFAULT_GRID_CONFIG: GridConfig = {
  columns: 3,
  rows: 3,
  currentSlotIndex: 2,
};

// =====================================================
// CM Tag
// =====================================================

export interface CmTag {
  id: string;
  cm_id: string;
  name: string;
  color: string;
  created_at: string;
}

export type SlotType = 'planned' | 'current' | 'history' | 'empty';

// =====================================================
// Customer Concept (Feed Planner version)
// =====================================================

export interface FeedCustomerConcept {
  id: string;
  customer_id: string;
  concept_id: string | null;
  status: CustomerConceptAssignmentStatus;
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
  feed_order: number | null;
  tags: string[];
  collection_id: string | null;
  cm_note: string | null;
  added_at: string;
  sent_at: string | null;
  produced_at: string | null;
  planned_publish_at: string | null;
  content_loaded_at: string | null;
  content_loaded_seen_at: string | null;
  published_at: string | null;
}

// =====================================================
// Feed Slot
// =====================================================

export interface FeedSlot {
  slotIndex: number;
  feedOrder: number;
  concept: FeedCustomerConcept | null;
  type: SlotType;
}

export function getSlotType(feedOrder: number | null): SlotType {
  if (feedOrder === null) return 'empty';
  if (feedOrder < 0) return 'history';
  if (feedOrder === 0) return 'current';
  return 'planned';
}
