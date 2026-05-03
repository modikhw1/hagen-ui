-- ============================================================================
-- H1 BRAND MODE SUPPORT
-- Adds brand_id column and makes clip_b_id nullable for Brand → Clip mode
-- ============================================================================

-- Make h1_type nullable and add 'custom' option
ALTER TABLE h1_training_pairs
DROP CONSTRAINT IF EXISTS h1_training_pairs_h1_type_check;

ALTER TABLE h1_training_pairs
ALTER COLUMN h1_type DROP NOT NULL;

ALTER TABLE h1_training_pairs
ADD CONSTRAINT h1_training_pairs_h1_type_check
CHECK (h1_type IS NULL OR h1_type IN (
  'quality_ranking',
  'humor_similarity',
  'replicability_similarity',
  'audience_fit',
  'custom'
));

-- Add h1_question for custom questions
ALTER TABLE h1_training_pairs
ADD COLUMN IF NOT EXISTS h1_question TEXT;

-- Make clip_b_id nullable for brand mode
ALTER TABLE h1_training_pairs
ALTER COLUMN clip_b_id DROP NOT NULL;

-- Add brand_id for Brand → Clip mode
ALTER TABLE h1_training_pairs
ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL;

-- Make winner nullable and add more options
ALTER TABLE h1_training_pairs
DROP CONSTRAINT IF EXISTS h1_training_pairs_winner_check;

ALTER TABLE h1_training_pairs
ALTER COLUMN winner DROP NOT NULL;

ALTER TABLE h1_training_pairs
ADD CONSTRAINT h1_training_pairs_winner_check
CHECK (winner IS NULL OR winner IN ('clip_a', 'clip_b', 'tie', 'equal', 'neither'));

-- Add strength column (0.0-1.0)
ALTER TABLE h1_training_pairs
ADD COLUMN IF NOT EXISTS strength FLOAT CHECK (strength IS NULL OR (strength >= 0 AND strength <= 1));

-- Drop the unique constraint that requires both clips
ALTER TABLE h1_training_pairs
DROP CONSTRAINT IF EXISTS h1_pairs_unique;

-- Drop the no-self constraint since brand mode doesn't have clip_b
ALTER TABLE h1_training_pairs
DROP CONSTRAINT IF EXISTS h1_pairs_no_self;

-- Add new constraint that validates the mode
ALTER TABLE h1_training_pairs
ADD CONSTRAINT h1_pairs_valid_mode
CHECK (
  -- Either clip-to-clip mode (both clips required)
  (clip_b_id IS NOT NULL AND brand_id IS NULL) OR
  -- Or brand-to-clip mode (brand required, no clip_b)
  (brand_id IS NOT NULL AND clip_b_id IS NULL)
);

-- Add constraint: h1_type or h1_question must be provided
ALTER TABLE h1_training_pairs
ADD CONSTRAINT h1_pairs_question_required
CHECK (h1_type IS NOT NULL OR h1_question IS NOT NULL);

-- Index for brand mode queries
CREATE INDEX IF NOT EXISTS idx_h1_pairs_brand ON h1_training_pairs(brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_h1_pairs_question ON h1_training_pairs(h1_question) WHERE h1_question IS NOT NULL;

COMMENT ON COLUMN h1_training_pairs.brand_id IS 'Brand profile for Brand → Clip mode annotations';
COMMENT ON COLUMN h1_training_pairs.h1_question IS 'Custom H1 question when h1_type is custom or NULL';
COMMENT ON COLUMN h1_training_pairs.strength IS 'Relationship strength (0.0 = weak/different, 1.0 = strong/similar)';
