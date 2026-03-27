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
  columns: number;           // always 3
  rows: number;              // default 2, configurable
  currentSlotIndex: number;  // 0-based index for "now" slot
}

export const DEFAULT_GRID_CONFIG: GridConfig = {
  columns: 3,
  rows: 2,  // Shows 6 slots instead of 9
  currentSlotIndex: 3  // slot 4 (index 3) = now (adjusted for 6 slots total)
};

// =====================================================
// CM Tag
// =====================================================

export interface CmTag {
  id: string;
  cm_id: string;
  name: string;
  color: string;  // hex color
  created_at: string;
}

export const PRESET_TAG_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // yellow
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#6B7280', // gray
  '#4A2F18', // LeTrend brown
] as const;

// =====================================================
// Slot Types
// =====================================================

export type SlotType = 'planned' | 'current' | 'history' | 'empty';

// =====================================================
// Customer Concept (Feed Planner version)
// =====================================================

export interface FeedCustomerConcept {
  id: string;
  customer_id: string;
  concept_id: string;

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

  // Feed planner - position
  feed_order: number | null;  // 0-centered: >0=future, 0=now, <0=history
  feed_slot: number | null;    // @deprecated - kept for backwards compatibility
  tags: string[];              // Array of tag names
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

// =====================================================
// Feed Slot
// =====================================================

export interface FeedSlot {
  slotIndex: number;          // 0-based
  feedOrder: number;          // corresponding feed_order value
  concept: FeedCustomerConcept | null;
  type: SlotType;
}

// =====================================================
// Feed Span (Thematic spans across multiple slots)
// =====================================================

export interface FeedSpan {
  id: string;
  customer_id: string;
  cm_id: string;

  // Position (fractional 0.0 - 1.0)
  frac_start: number;
  frac_end: number;
  climax: number | null;       // optional climax point (frac position)
  climax_date: string | null;  // optional date for climax, e.g. "2026-02-14"

  // Visual
  color_index: number;

  // Content
  title: string;
  body: string;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export const SPAN_COLOR_PALETTE = [
  { name: 'Alla hjärtans dag', color: '#EC4899' },
  { name: 'Halloween', color: '#F97316' },
  { name: 'Lunch-promo', color: '#10B981' },
  { name: 'Sommarkampanj', color: '#3B82F6' },
  { name: 'Höst', color: '#A78BFA' },
  { name: 'Neutral', color: '#C4B5A0' },
] as const;

// =====================================================
// Helper functions
// =====================================================

/**
 * Determine slot type based on feed order relative to now
 */
export function getSlotType(feedOrder: number | null, currentSlotIndex: number): SlotType {
  if (feedOrder === null) return 'empty';

  if (feedOrder < 0) return 'history';
  if (feedOrder === 0) return 'current';
  return 'planned';
}

/**
 * Build feed slots from customer concepts
 */
export function buildFeedSlots(
  concepts: FeedCustomerConcept[],
  gridConfig: GridConfig = DEFAULT_GRID_CONFIG
): FeedSlot[] {
  const totalSlots = gridConfig.columns * gridConfig.rows;
  const slots: FeedSlot[] = [];

  for (let i = 0; i < totalSlots; i++) {
    const feedOrder = i - gridConfig.currentSlotIndex;
    const concept = concepts.find(c => c.feed_order === feedOrder) || null;
    const type = getSlotType(feedOrder, gridConfig.currentSlotIndex);

    slots.push({
      slotIndex: i,
      feedOrder,
      concept,
      type,
    });
  }

  return slots;
}
