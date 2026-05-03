-- Migration 026: Make video_signals(video_id, brand_id) actually unique when brand_id IS NULL
--
-- The original UNIQUE(video_id, brand_id) constraint from migration 016 does not
-- prevent duplicates when brand_id IS NULL (Postgres treats NULLs as distinct by
-- default). The /api/analyze-rate endpoint always inserts with brand_id = NULL,
-- so two simultaneous confirms could create duplicate signal rows for the same
-- video. This migration switches to NULLS NOT DISTINCT so the unique constraint
-- treats NULLs as equal, which lets us use a real upsert with onConflict.
--
-- Step 1 dedupes any pre-existing duplicates so the new constraint can be added.
-- We keep the most recently-updated row per (video_id, brand_id) bucket.

-- =============================================================================
-- STEP 1: Deduplicate existing rows (keep most recently updated)
-- =============================================================================

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY video_id, brand_id
            ORDER BY
                -- Prefer rows with embeddings, then most recently updated, then created
                (embedding IS NOT NULL) DESC,
                updated_at DESC NULLS LAST,
                created_at DESC NULLS LAST
        ) AS rn
    FROM video_signals
)
DELETE FROM video_signals
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- =============================================================================
-- STEP 2: Replace the unique constraint with NULLS NOT DISTINCT
-- =============================================================================

ALTER TABLE video_signals
    DROP CONSTRAINT IF EXISTS video_signals_video_id_brand_id_key;

ALTER TABLE video_signals
    ADD CONSTRAINT video_signals_video_id_brand_id_key
    UNIQUE NULLS NOT DISTINCT (video_id, brand_id);

COMMENT ON CONSTRAINT video_signals_video_id_brand_id_key ON video_signals
    IS 'One signal row per (video, brand). NULLs are treated as equal so brand_id IS NULL rows are still unique per video.';
