-- =====================================================================
-- Migration 027: Drop 8 legacy flat columns from customer_concepts (Batch 1)
-- =====================================================================
-- Purpose: Drop legacy mirror columns that have been confirmed empty in the
-- live DB and have had all app-layer reads/writes removed (Phases 4–16).
--
-- Live data gate (Phase 17, run 2026-04-04 against live project fllzlpecwwabwgfbnxfu):
--
--   Column                  | Non-empty rows (of 31 total)
--   ------------------------|-----------------------------
--   notes                   | 0  ✅ safe to drop
--   custom_headline         | 0  ✅ safe to drop
--   custom_description      | 0  ✅ safe to drop
--   custom_script           | 0  ✅ safe to drop
--   custom_why_it_works     | 0  ✅ safe to drop
--   custom_instructions     | 0  ✅ safe to drop
--   custom_target_audience  | 0  ✅ safe to drop
--   why_it_fits             | 0  ✅ safe to drop
--   filming_instructions    | 1  ⚠️  deferred — see migration 028
--
-- filming_instructions is excluded from this migration.
-- That one row holds data not yet present in content_overrides.
-- Phase 18 will backfill filming_instructions → content_overrides,
-- then drop the column. See phase-17 output document for exact SQL.
--
-- App-layer cleanup that unblocked this drop:
--   Phase 4:  removed notes dual-write from PATCH payload
--   Phase 8:  removed notes read fallback from resolver
--   Phase 9:  removed 8 legacy columns from customer-facing SELECTs/types
--   Phase 11: removed legacy columns from studio normalizer
--   Phase 16: removed last explicit SELECTs (customer/notes/route.ts,
--             demo page) and last write (custom_script in import-history)
-- =====================================================================

alter table public.customer_concepts
  drop column if exists notes,
  drop column if exists custom_headline,
  drop column if exists custom_description,
  drop column if exists custom_script,
  drop column if exists custom_why_it_works,
  drop column if exists custom_instructions,
  drop column if exists custom_target_audience,
  drop column if exists why_it_fits;
