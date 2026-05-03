-- Video ratings for model training
-- This table captures human preferences on video content for fine-tuning

CREATE TABLE video_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES analyzed_videos(id) ON DELETE CASCADE,
  
  -- Core preference signal (0.0 to 1.0)
  overall_score DECIMAL(3,2) CHECK (overall_score BETWEEN 0 AND 1),
  
  -- Flexible dimension scores (sparse - only fill what's relevant)
  -- Example: {"hook": 0.9, "pacing": 0.7, "originality": 0.85}
  dimensions JSONB DEFAULT '{}',
  
  -- Quick qualitative tags (optional, for pattern discovery)
  tags TEXT[] DEFAULT '{}',
  
  -- Free-form notes (helps remember why, also used in training)
  notes TEXT,
  
  -- Training metadata
  rated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  training_exported BOOLEAN DEFAULT FALSE,
  exported_at TIMESTAMP WITH TIME ZONE,
  
  -- For multi-rater scenarios later
  rater_id TEXT DEFAULT 'primary',
  
  -- Ensure one rating per video per rater
  UNIQUE(video_id, rater_id)
);

-- Indexes for performance
CREATE INDEX idx_ratings_not_exported ON video_ratings(training_exported) WHERE NOT training_exported;
CREATE INDEX idx_ratings_overall ON video_ratings(overall_score);
CREATE INDEX idx_ratings_video ON video_ratings(video_id);
CREATE INDEX idx_ratings_rater ON video_ratings(rater_id);
CREATE INDEX idx_ratings_dimensions ON video_ratings USING GIN (dimensions);
CREATE INDEX idx_ratings_tags ON video_ratings USING GIN (tags);

-- Add comment for documentation
COMMENT ON TABLE video_ratings IS 'Human preference ratings for video content, used to train fine-tuned models';
COMMENT ON COLUMN video_ratings.dimensions IS 'Sparse dimension scores like hook, pacing, originality, payoff, rewatchable';
COMMENT ON COLUMN video_ratings.overall_score IS 'Overall quality/preference score from 0.0 to 1.0';
