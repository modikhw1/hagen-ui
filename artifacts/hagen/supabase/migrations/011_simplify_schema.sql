-- ============================================================================
-- SCHEMA SIMPLIFICATION - Remove Redundant and Unused Elements
-- ============================================================================
-- Created: December 9, 2025
-- Purpose: Streamline database by removing unused tables, columns, and views
--
-- Background:
-- - analyzed_videos.user_ratings (JSONB) is redundant with video_ratings table
-- - active_criteria view is unused in application code
-- - ratings_v2 table was planned but never integrated into UI
-- - Multiple conversation/rating systems can be consolidated
--
-- Impact: This migration removes unused schema elements to simplify the system
-- before establishing core quality metrics and validation framework.
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop unused views
-- ============================================================================

-- Drop active_criteria view (defined in 006_limitless_schema.sql)
-- Not referenced in any application code
DROP VIEW IF EXISTS active_criteria;

-- Drop ratings_with_videos view if exists (also from 006_limitless_schema.sql)
DROP VIEW IF EXISTS ratings_with_videos CASCADE;

-- ============================================================================
-- STEP 2: Remove redundant column from analyzed_videos
-- ============================================================================

-- The user_ratings JSONB column in analyzed_videos is redundant
-- All ratings are now stored in the video_ratings table (normalized)
-- This was a legacy design that created dual-write complexity

-- First, verify no critical data exists only in this column
-- (This is a safety check - should return 0 or very few rows)
DO $$
DECLARE
  orphaned_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphaned_count
  FROM analyzed_videos av
  WHERE av.user_ratings IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM video_ratings vr WHERE vr.video_id = av.id
    );
  
  IF orphaned_count > 0 THEN
    RAISE NOTICE 'Found % videos with user_ratings but no entry in video_ratings table', orphaned_count;
    RAISE NOTICE 'Consider migrating this data before dropping column';
  END IF;
END $$;

-- Drop views that depend on user_ratings column
DROP VIEW IF EXISTS rated_videos CASCADE;
DROP VIEW IF EXISTS pending_rating_videos CASCADE;

-- Drop the redundant column
ALTER TABLE analyzed_videos 
DROP COLUMN IF EXISTS user_ratings CASCADE;

COMMENT ON TABLE analyzed_videos IS 
'Videos that have been analyzed by Gemini. Ratings are stored in the separate video_ratings table.';

-- ============================================================================
-- STEP 3: Archive ratings_v2 experiment (Limitless Schema)
-- ============================================================================

-- The ratings_v2 table was part of the "limitless schema" experiment
-- where AI would extract criteria from natural language notes.
-- This feature was never integrated into the UI and adds complexity.
-- We're shelving this until core rating system is validated.

-- Option A: Drop entirely (recommended for simplification)
DROP TABLE IF EXISTS ratings_v2 CASCADE;

-- Also drop related tables that were part of this experiment
DROP TABLE IF EXISTS discovered_criteria CASCADE;
DROP TABLE IF EXISTS learned_patterns CASCADE;

-- Keep discovered_patterns (from migration 002) as it may still be used
-- Keep rating_schema_versions as it tracks core rating evolution

COMMENT ON TABLE rating_schema_versions IS 
'Tracks evolution of the core rating schema. ratings_v2 experiment has been archived.';

-- ============================================================================
-- STEP 4: Document remaining dual-write locations
-- ============================================================================

-- The following endpoints still perform dual writes that should be reviewed:
-- 1. /api/videos/rate - writes to analyzed_videos AND video_ratings
-- 2. /api/analyze-rate - writes to video_ratings AND content_embedding
--
-- These are intentional and serve different purposes:
-- - analyzed_videos stores Gemini analysis (visual_analysis, audio_analysis)
-- - video_ratings stores human ratings
-- - content_embedding stores RAG vectors for similarity search
--
-- No action needed here, just documentation.

-- ============================================================================
-- STEP 5: Clean up unused indexes (if any were created for dropped tables)
-- ============================================================================

-- Indexes on dropped tables are automatically removed
-- This is just explicit documentation

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these after migration to verify cleanup:

-- 1. Verify user_ratings column is gone
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'analyzed_videos' AND column_name = 'user_ratings';
-- Expected: 0 rows

-- 2. Verify views are dropped
-- SELECT table_name FROM information_schema.views 
-- WHERE table_schema = 'public' AND table_name IN ('active_criteria', 'ratings_with_videos');
-- Expected: 0 rows

-- 3. Verify ratings_v2 table is gone
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_name = 'ratings_v2';
-- Expected: 0 rows

-- 4. Check remaining tables
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- ORDER BY table_name;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ============================================================================

-- If you need to restore ratings_v2 for any reason:
-- 1. Re-run migration 006_limitless_schema.sql
-- 2. Note: Any data in user_ratings column will be permanently lost
-- 3. active_criteria view can be recreated from 006_limitless_schema.sql

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Log successful completion
DO $$
BEGIN
  RAISE NOTICE 'Schema simplification completed successfully';
  RAISE NOTICE 'Removed: user_ratings column, active_criteria view, ratings_v2 table';
  RAISE NOTICE 'Keeping: video_ratings (primary), analyzed_videos (Gemini data), content_embedding (RAG)';
END $$;
