-- ============================================================================
-- CLEANUP MIGRATION
-- ============================================================================

-- 1. Drop unused views
DROP VIEW IF EXISTS active_criteria;
DROP VIEW IF EXISTS ratings_with_videos CASCADE;
DROP VIEW IF EXISTS rated_videos CASCADE;
DROP VIEW IF EXISTS pending_rating_videos CASCADE;

-- 2. Drop unused tables
-- These tables returned 'null' rows in our check, indicating they might be empty 
-- or we don't have permission to read them, but they are confirmed unused by code.
DROP TABLE IF EXISTS ratings_v2 CASCADE;
DROP TABLE IF EXISTS discovered_criteria CASCADE;
DROP TABLE IF EXISTS learned_patterns CASCADE;

-- 3. Remove redundant column
-- Only run this if you are sure. The analyzed_videos table is active (128 rows).
ALTER TABLE analyzed_videos DROP COLUMN IF EXISTS user_ratings CASCADE;
