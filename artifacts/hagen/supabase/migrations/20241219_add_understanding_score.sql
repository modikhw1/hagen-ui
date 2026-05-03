-- Add understanding_score column to track how well Gemini's analysis matches human understanding
-- This score (0-100) is computed by comparing embeddings of Gemini's interpretation vs human correction

ALTER TABLE video_analysis_examples 
ADD COLUMN IF NOT EXISTS understanding_score integer;

-- Add index for efficient filtering by understanding score
CREATE INDEX IF NOT EXISTS idx_video_analysis_examples_understanding_score 
ON video_analysis_examples(understanding_score);

-- Add comment explaining the column
COMMENT ON COLUMN video_analysis_examples.understanding_score IS 
'Semantic similarity score (0-100) between Gemini interpretation and human correction. Higher = better alignment with human understanding.';
