-- Add tracking columns to video_analysis_examples for correction effectiveness
-- This tracks which corrections were used and whether they improved accuracy

-- Add columns for tracking (avoiding GENERATED column to prevent table rewrite memory issues)
ALTER TABLE video_analysis_examples 
ADD COLUMN IF NOT EXISTS times_effective INTEGER DEFAULT 0;

ALTER TABLE video_analysis_examples 
ADD COLUMN IF NOT EXISTS times_ineffective INTEGER DEFAULT 0;

ALTER TABLE video_analysis_examples 
ADD COLUMN IF NOT EXISTS last_effectiveness_update TIMESTAMPTZ;

-- Create a helper function to compute effectiveness ratio (used in queries)
CREATE OR REPLACE FUNCTION compute_effectiveness_ratio(effective INT, ineffective INT)
RETURNS FLOAT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN (effective + ineffective) = 0 THEN 0.5
    ELSE effective::float / (effective + ineffective)
  END;
$$;

-- Add column to store the transcript for better matching
ALTER TABLE video_analysis_examples
ADD COLUMN IF NOT EXISTS transcript TEXT,
ADD COLUMN IF NOT EXISTS scene_breakdown TEXT;

-- Create a table to track which examples were used for each analysis
CREATE TABLE IF NOT EXISTS learning_example_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  example_id UUID REFERENCES video_analysis_examples(id) ON DELETE CASCADE,
  video_id UUID REFERENCES analyzed_videos(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  similarity_score FLOAT,
  was_helpful BOOLEAN DEFAULT NULL,  -- Set when user provides feedback
  feedback_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_learning_usage_example ON learning_example_usage(example_id);
CREATE INDEX IF NOT EXISTS idx_learning_usage_video ON learning_example_usage(video_id);
CREATE INDEX IF NOT EXISTS idx_learning_usage_helpful ON learning_example_usage(was_helpful) WHERE was_helpful IS NOT NULL;

-- Function to record example usage with effectiveness tracking
CREATE OR REPLACE FUNCTION record_example_usage_with_tracking(
  p_example_id UUID,
  p_video_id UUID,
  p_similarity FLOAT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  usage_id UUID;
BEGIN
  -- Insert usage record
  INSERT INTO learning_example_usage (example_id, video_id, similarity_score)
  VALUES (p_example_id, p_video_id, p_similarity)
  RETURNING id INTO usage_id;
  
  -- Update the example's times_used
  UPDATE video_analysis_examples
  SET 
    times_used = times_used + 1,
    last_used_at = NOW()
  WHERE id = p_example_id;
  
  RETURN usage_id;
END;
$$;

-- Function to record feedback on whether an example was helpful
CREATE OR REPLACE FUNCTION record_example_feedback(
  p_usage_id UUID,
  p_was_helpful BOOLEAN,
  p_notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_example_id UUID;
BEGIN
  -- Get the example ID and update feedback
  SELECT example_id INTO v_example_id
  FROM learning_example_usage
  WHERE id = p_usage_id;
  
  -- Update the usage record
  UPDATE learning_example_usage
  SET 
    was_helpful = p_was_helpful,
    feedback_notes = p_notes
  WHERE id = p_usage_id;
  
  -- Update the example's effectiveness tracking
  IF p_was_helpful THEN
    UPDATE video_analysis_examples
    SET 
      times_effective = times_effective + 1,
      last_effectiveness_update = NOW()
    WHERE id = v_example_id;
  ELSE
    UPDATE video_analysis_examples
    SET 
      times_ineffective = times_ineffective + 1,
      last_effectiveness_update = NOW()
    WHERE id = v_example_id;
  END IF;
END;
$$;

-- Update the find function to prioritize effective examples
-- Must drop first because return type is changing
DROP FUNCTION IF EXISTS find_video_analysis_examples(vector,text[],text[],text,text,double precision,integer);

CREATE OR REPLACE FUNCTION find_video_analysis_examples(
  query_embedding vector(1536),
  target_example_types TEXT[] DEFAULT NULL,
  target_humor_types TEXT[] DEFAULT NULL,
  target_industry TEXT DEFAULT NULL,
  target_format TEXT DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  example_type TEXT,
  video_summary TEXT,
  gemini_interpretation TEXT,
  correct_interpretation TEXT,
  explanation TEXT,
  humor_type_correction JSONB,
  cultural_context TEXT,
  visual_elements TEXT[],
  tags TEXT[],
  humor_types TEXT[],
  quality_score FLOAT,
  similarity FLOAT,
  transcript TEXT,
  scene_breakdown TEXT,
  effectiveness FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.example_type,
    e.video_summary,
    e.gemini_interpretation,
    e.correct_interpretation,
    e.explanation,
    e.humor_type_correction,
    e.cultural_context,
    e.visual_elements,
    e.tags,
    e.humor_types,
    e.quality_score,
    1 - (e.embedding <=> query_embedding) as similarity,
    e.transcript,
    e.scene_breakdown,
    compute_effectiveness_ratio(COALESCE(e.times_effective, 0), COALESCE(e.times_ineffective, 0)) as effectiveness
  FROM video_analysis_examples e
  WHERE e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
    AND (target_example_types IS NULL OR e.example_type = ANY(target_example_types))
    AND (target_humor_types IS NULL OR e.humor_types && target_humor_types)
    AND (target_industry IS NULL OR e.industry = target_industry OR e.industry IS NULL)
    AND (target_format IS NULL OR e.content_format = target_format OR e.content_format IS NULL)
  ORDER BY 
    -- Prioritize by: effectiveness * quality * similarity
    (compute_effectiveness_ratio(COALESCE(e.times_effective, 0), COALESCE(e.times_ineffective, 0)) * e.quality_score * (1 - (e.embedding <=> query_embedding))) DESC
  LIMIT match_count;
END;
$$;

COMMENT ON TABLE learning_example_usage IS 
'Tracks which learning examples were used for each video analysis, enabling effectiveness measurement';

COMMENT ON FUNCTION record_example_feedback IS 
'Records user feedback on whether a learning example was helpful, updating effectiveness metrics';
