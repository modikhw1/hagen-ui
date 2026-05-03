-- =====================================================================
-- Migration 026: Drop custom_production_notes from customer_concepts
-- =====================================================================
-- Purpose: Remove the legacy custom_production_notes column that has had
-- zero app-layer reads (Phase 14) and zero live data rows (Phase 13 gate).
--
-- Gate evidence (Phase 13, run 2026-04-03 against live project fllzlpecwwabwgfbnxfu):
--   SELECT COUNT(*) FROM customer_concepts
--   WHERE custom_production_notes IS NOT NULL
--     AND array_length(custom_production_notes, 1) > 0;
--   Result: 0 rows (of 31 total)
--
-- App-layer evidence (Phase 14):
--   - Removed from customer-facing SELECTs in customer/concepts/route.ts,
--     customer/concepts/[conceptId]/route.ts, customer/feed/route.ts
--   - Removed from RawCustomerConceptDetailRow, RawCustomerConceptListRow,
--     RawCustomerFeedRow types
--   - Removed from MetadataSectionInput and resolveCustomerConceptMetadataSection
--     fallback chain
--   - Removed from buildCustomerFeedSlot production notes chain
--   - No write paths existed
--
-- This is the smallest safe schema drop batch after Phase 14.
-- All other legacy flat columns (custom_headline, custom_description, etc.)
-- still have live explicit SELECTs in customer/notes/route.ts and
-- demo/[customerId]/page.tsx and are excluded from this migration.
-- =====================================================================

alter table public.customer_concepts
  drop column if exists custom_production_notes;
