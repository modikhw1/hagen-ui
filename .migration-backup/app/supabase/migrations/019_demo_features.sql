-- 019_demo_features.sql
-- Allow null concept_id in customer_concepts so TikTok history clips
-- (which have no associated concept) can be stored as feed history slots.
--
-- PostgreSQL FK constraints automatically skip NULL values, so the existing
-- concepts(id) FK remains valid for non-null rows. The UNIQUE constraint on
-- (customer_profile_id, concept_id) also already allows multiple NULLs since
-- NULL != NULL in SQL uniqueness checks.

ALTER TABLE customer_concepts
  ALTER COLUMN concept_id DROP NOT NULL;

-- Index to efficiently query history-only slots (concept_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_customer_concepts_history_slots
  ON customer_concepts(customer_profile_id, feed_order)
  WHERE concept_id IS NULL;
