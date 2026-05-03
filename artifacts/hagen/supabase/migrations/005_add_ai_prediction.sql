-- Add AI prediction column to video_ratings for tracking disagreement patterns
-- This allows comparing human ratings with AI predictions to identify where the model needs improvement

ALTER TABLE video_ratings 
ADD COLUMN IF NOT EXISTS ai_prediction JSONB;

-- Comment for documentation
COMMENT ON COLUMN video_ratings.ai_prediction IS 'AI prediction at time of rating, used to track disagreement patterns for model improvement';

-- Index for querying disagreement patterns
CREATE INDEX IF NOT EXISTS idx_ratings_ai_prediction ON video_ratings USING GIN (ai_prediction);
