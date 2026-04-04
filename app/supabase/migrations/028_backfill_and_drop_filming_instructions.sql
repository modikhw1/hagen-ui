-- =====================================================================
-- Migration 028: Backfill filming_instructions → content_overrides,
--               then drop filming_instructions column
-- =====================================================================
-- Purpose: Promote the one live row that has filming_instructions data
-- not yet present in content_overrides, then drop the flat column.
--
-- Live gate (Phase 18, run 2026-04-04 against live project fllzlpecwwabwgfbnxfu):
--   1 row has filming_instructions data; content_overrides.filming_instructions is null.
--   Row id: 49ff1a38-facd-40be-bc33-8e94d995a07b
--   Value:  "Testa gå för en snabbare klippning denna gång.
--            Senast gick det inte exakt som det bör ha gått."
--
-- Idempotency: the UPDATE WHERE clause only touches rows where the flat
-- column has a value AND content_overrides lacks the key (or is empty for
-- that key). Safe to run multiple times — already-backfilled rows are skipped.
-- On a fresh install (db reset through migrations 007..027) filming_instructions
-- is empty, so the UPDATE is a no-op and the DROP proceeds cleanly.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- Step 1: Backfill flat filming_instructions → content_overrides
-- ─────────────────────────────────────────────────────────────────────
-- jsonb_set writes the key without touching other content_overrides fields.
-- COALESCE handles the (unlikely) case of a NULL content_overrides cell.
-- Only rows where the flat column has content AND the JSONB key is absent
-- or empty are updated — existing canonical values are never overwritten.

UPDATE public.customer_concepts
SET content_overrides = jsonb_set(
  COALESCE(content_overrides, '{}'::jsonb),
  '{filming_instructions}',
  to_jsonb(filming_instructions)
)
WHERE filming_instructions IS NOT NULL
  AND filming_instructions <> ''
  AND (
    content_overrides IS NULL
    OR NOT (content_overrides ? 'filming_instructions')
    OR content_overrides->>'filming_instructions' IS NULL
    OR content_overrides->>'filming_instructions' = ''
  );

-- ─────────────────────────────────────────────────────────────────────
-- Step 2: Drop the filming_instructions flat column
-- ─────────────────────────────────────────────────────────────────────
-- All app-layer reads and writes of this column were removed in Phase 16.
-- The backfill above ensures no live data is lost.

ALTER TABLE public.customer_concepts
  DROP COLUMN IF EXISTS filming_instructions;
