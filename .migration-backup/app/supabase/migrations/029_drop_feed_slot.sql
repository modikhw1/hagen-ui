-- =====================================================================
-- Migration 029: Drop feed_slot column from customer_concepts
-- =====================================================================
-- Purpose: Remove the deprecated feed_slot column that has had no live
-- data, no active app-layer reads, and no active writes throughout the
-- Phase 3–19 cleanup series.
--
-- Live data gate (Phase 19, run 2026-04-04 against live project fllzlpecwwabwgfbnxfu):
--   total_rows:    31
--   has_feed_slot:  0  (no row carries any feed_slot value)
--   has_feed_order: 18 (canonical placement is in feed_order, not feed_slot)
--
-- feed_slot vs feed_order:
--   feed_order is the canonical placement signal: 0-centered integer,
--   >0 = upcoming, 0 = current, <0 = history, NULL = not in plan.
--   feed_slot was a legacy 1–9 slot number superseded by feed_order.
--   All studio routes and normalizers already use feed_order exclusively.
--
-- App-layer cleanup done in Phase 19 before this migration:
--   - Removed feed_slot from the two explicit studio SELECTs
--     (mark-produced/route.ts, customers/[customerId]/concepts/route.ts)
--   - Removed from normalizeStudioCustomerConcept
--     (studio/customer-concepts.ts lines 84, 125, 153)
--   - Removed from CustomerConceptPlacementBoundary and CustomerConceptBase
--     (types/studio-v2.ts)
--   - Removed from FeedPlannerConcept (studio/feed-planner-types.ts)
--
-- Step 1: Drop the range CHECK constraint captured in migration 024.
-- Step 2: Drop the column.
-- Both steps use IF EXISTS / IF EXISTS so the migration is safe on
-- fresh installs that may not have the constraint or the column yet.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. Drop the feed_slot range CHECK constraint
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.customer_concepts
  DROP CONSTRAINT IF EXISTS customer_concepts_feed_slot_check;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Drop feed_slot column
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.customer_concepts
  DROP COLUMN IF EXISTS feed_slot;
