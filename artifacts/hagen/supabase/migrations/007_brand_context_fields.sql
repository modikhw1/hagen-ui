-- Add brand context fields to video_ratings
-- These capture replicability and brand fit context

ALTER TABLE video_ratings 
ADD COLUMN IF NOT EXISTS replicability_notes TEXT,
ADD COLUMN IF NOT EXISTS brand_context TEXT,
ADD COLUMN IF NOT EXISTS humor_type TEXT;

-- Add index for searching brand context
CREATE INDEX IF NOT EXISTS idx_video_ratings_brand_context 
ON video_ratings USING GIN (to_tsvector('english', brand_context));

-- Create corrections table for feedback loop
CREATE TABLE IF NOT EXISTS analysis_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url TEXT NOT NULL,
  original_analysis JSONB NOT NULL,
  correction JSONB NOT NULL,
  correction_type TEXT NOT NULL, -- 'humor_type', 'joke_structure', 'scores', 'brand_context'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corrections_url ON analysis_corrections(video_url);
CREATE INDEX IF NOT EXISTS idx_corrections_type ON analysis_corrections(correction_type);

COMMENT ON COLUMN video_ratings.replicability_notes IS 'Notes on how easily this content can be recreated by other businesses';
COMMENT ON COLUMN video_ratings.brand_context IS 'Notes on brand fit - what type of establishment this suits or does NOT suit';
COMMENT ON COLUMN video_ratings.humor_type IS 'Primary humor type classification';
