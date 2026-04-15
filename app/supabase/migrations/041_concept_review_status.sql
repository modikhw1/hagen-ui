-- Persisted review state for concepts.
-- Keeps is_active for published visibility while adding a durable intermediate reviewed stage.

ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_concepts_reviewed_at ON concepts(reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_concepts_reviewed_by ON concepts(reviewed_by);

-- Backfill published concepts so existing live library items are also considered reviewed.
UPDATE concepts
SET
  reviewed_at = COALESCE(reviewed_at, updated_at, created_at, NOW()),
  reviewed_by = COALESCE(reviewed_by, created_by)
WHERE is_active = TRUE
  AND reviewed_at IS NULL;

COMMENT ON COLUMN concepts.reviewed_at IS 'When the concept was explicitly marked as review-complete';
COMMENT ON COLUMN concepts.reviewed_by IS 'Profile who marked the concept as review-complete';
