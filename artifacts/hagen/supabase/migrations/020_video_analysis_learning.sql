-- ============================================================================
-- VIDEO ANALYSIS LEARNING SYSTEM
-- RAG-based learning from annotated videos to improve Gemini analysis
-- ============================================================================

-- ============================================================================
-- VIDEO ANALYSIS EXAMPLES
-- Stores annotated video examples for few-shot learning
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_analysis_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source video reference
  video_id UUID REFERENCES analyzed_videos(id) ON DELETE SET NULL,
  video_url TEXT,  -- Keep URL even if video deleted
  
  -- Example categorization
  example_type TEXT NOT NULL CHECK (example_type IN (
    'humor_interpretation',   -- Correct humor type/mechanism identification
    'cultural_context',       -- Cultural/generational nuance
    'visual_punchline',       -- When punchline is visual, not verbal
    'misdirection',           -- Setup/subversion pattern
    'replicability',          -- Template/format extraction
    'bad_interpretation'      -- What Gemini got wrong (negative example)
  )),
  
  -- The teaching content
  video_summary TEXT NOT NULL,         -- Brief description of video content
  gemini_interpretation TEXT,          -- What Gemini originally said
  correct_interpretation TEXT NOT NULL, -- What the human corrected it to
  explanation TEXT NOT NULL,           -- WHY this is the correct interpretation
  
  -- Structured correction fields (for targeted learning)
  humor_type_correction JSONB,         -- { "original": "wordplay", "correct": "visual-reveal", "why": "..." }
  cultural_context TEXT,               -- Cultural/generational context needed
  visual_elements TEXT[],              -- Key visual elements Gemini missed
  
  -- Metadata for matching
  tags TEXT[],                         -- ['generational', 'cafe', 'physical-comedy']
  humor_types TEXT[],                  -- Humor types demonstrated
  industry TEXT,                       -- 'restaurant', 'cafe', 'bar', etc.
  content_format TEXT,                 -- 'skit', 'pov', 'montage', etc.
  
  -- Embedding for semantic retrieval
  embedding vector(1536),
  
  -- Quality and usage tracking
  quality_score FLOAT DEFAULT 0.8,     -- How good is this example
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'manual'
);

-- Indexes for efficient retrieval
CREATE INDEX IF NOT EXISTS idx_video_examples_type ON video_analysis_examples(example_type);
CREATE INDEX IF NOT EXISTS idx_video_examples_humor ON video_analysis_examples USING GIN (humor_types);
CREATE INDEX IF NOT EXISTS idx_video_examples_tags ON video_analysis_examples USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_video_examples_industry ON video_analysis_examples(industry);
CREATE INDEX IF NOT EXISTS idx_video_examples_format ON video_analysis_examples(content_format);
CREATE INDEX IF NOT EXISTS idx_video_examples_quality ON video_analysis_examples(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_video_examples_embedding ON video_analysis_examples 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- FUNCTIONS FOR VIDEO ANALYSIS RAG
-- ============================================================================

-- Find relevant video analysis examples for a given context
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
  similarity FLOAT
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
    1 - (e.embedding <=> query_embedding) as similarity
  FROM video_analysis_examples e
  WHERE e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
    AND (target_example_types IS NULL OR e.example_type = ANY(target_example_types))
    AND (target_humor_types IS NULL OR e.humor_types && target_humor_types)
    AND (target_industry IS NULL OR e.industry = target_industry OR e.industry IS NULL)
    AND (target_format IS NULL OR e.content_format = target_format OR e.content_format IS NULL)
  ORDER BY 
    e.quality_score DESC,
    e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Record when an example is used (for tracking effectiveness)
CREATE OR REPLACE FUNCTION record_video_example_usage(example_uuid UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE video_analysis_examples
  SET 
    times_used = times_used + 1,
    last_used_at = NOW()
  WHERE id = example_uuid;
END;
$$;

-- ============================================================================
-- IMPORT EXISTING CORRECTIONS AS EXAMPLES
-- Migrate gemini_corrections from analyzed_videos into training examples
-- ============================================================================

CREATE OR REPLACE FUNCTION migrate_gemini_corrections_to_examples()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  migrated_count INTEGER := 0;
  correction_record RECORD;
  correction JSONB;
BEGIN
  FOR correction_record IN 
    SELECT 
      av.id as video_id,
      av.video_url,
      av.visual_analysis,
      jsonb_array_elements(av.gemini_corrections) as correction
    FROM analyzed_videos av
    WHERE av.gemini_corrections IS NOT NULL 
      AND av.gemini_corrections != '[]'::jsonb
  LOOP
    correction := correction_record.correction;
    
    INSERT INTO video_analysis_examples (
      video_id,
      video_url,
      example_type,
      video_summary,
      gemini_interpretation,
      correct_interpretation,
      explanation,
      humor_type_correction,
      created_by
    ) VALUES (
      correction_record.video_id,
      correction_record.video_url,
      CASE 
        WHEN correction->'corrections'->>'humorType' IS NOT NULL THEN 'humor_interpretation'
        WHEN correction->'corrections'->>'whyFunny' IS NOT NULL THEN 'humor_interpretation'
        ELSE 'cultural_context'
      END,
      COALESCE(
        correction_record.visual_analysis->>'summary',
        correction_record.visual_analysis->'content'->>'keyMessage',
        'Video analysis'
      ),
      COALESCE(
        correction->'originalValues'->>'humorType',
        correction->'originalValues'->>'whyFunny',
        'Original Gemini interpretation'
      ),
      COALESCE(
        correction->'corrections'->>'humorType',
        correction->'corrections'->>'whyFunny',
        correction->'corrections'->>'conceptCore',
        'Corrected interpretation'
      ),
      COALESCE(correction->>'note', 'Human correction'),
      CASE 
        WHEN correction->'corrections'->>'humorType' IS NOT NULL 
        THEN jsonb_build_object(
          'original', correction->'originalValues'->>'humorType',
          'correct', correction->'corrections'->>'humorType',
          'why', correction->>'note'
        )
        ELSE NULL
      END,
      'migrated'
    )
    ON CONFLICT DO NOTHING;
    
    migrated_count := migrated_count + 1;
  END LOOP;
  
  RETURN migrated_count;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE video_analysis_examples IS 
'Training examples for video analysis RAG. Each row represents a corrected/annotated video 
that teaches Gemini how to better interpret similar content. The embedding allows semantic 
matching to find relevant examples when analyzing new videos.';

COMMENT ON FUNCTION find_video_analysis_examples IS 
'RAG retrieval function for video analysis. Given an embedding of the current video context,
finds the most relevant annotated examples to inject as few-shot learning context.';

COMMENT ON FUNCTION migrate_gemini_corrections_to_examples IS 
'One-time migration function to convert existing gemini_corrections into video_analysis_examples
for the new RAG-based learning system.';
