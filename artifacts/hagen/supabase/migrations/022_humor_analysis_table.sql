-- ============================================================================
-- VIDEO HUMOR ANALYSIS TABLE
-- Modular table for storing humor-specific analysis, separate from general video data
-- ============================================================================

-- Create the video_humor_analysis table
CREATE TABLE IF NOT EXISTS video_humor_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to core video object
  video_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,
  
  -- Gemini's raw analysis output (from deep-reasoning.ts)
  gemini_analysis JSONB NOT NULL DEFAULT '{}',
  
  -- Extracted/normalized humor fields (for easy querying)
  humor_type TEXT,                    -- 'visual-reveal', 'subversion', 'absurdist', 'wordplay', etc.
  humor_mechanism TEXT,               -- How the joke works (the "why it's funny")
  comedy_timing_score INTEGER CHECK (comedy_timing_score >= 0 AND comedy_timing_score <= 10),
  is_humorous BOOLEAN,
  
  -- Joke structure (hook, setup, payoff)
  joke_structure JSONB,               -- { hook: string, setup: string, payoff: string, payoffType: string }
  
  -- Summary
  summary TEXT,                       -- Brief description of the video/joke
  
  -- Replicability (humor-focused - how to recreate this joke)
  replicability_template TEXT,
  replicability_score INTEGER CHECK (replicability_score >= 0 AND replicability_score <= 10),
  required_elements TEXT[],
  
  -- Human corrections stored here
  human_corrections JSONB DEFAULT '[]', -- Array of { field, original, corrected, notes, corrected_at }
  correction_count INTEGER DEFAULT 0,
  
  -- Confidence tracking (for review queue)
  confidence_score FLOAT DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  needs_review BOOLEAN DEFAULT false,
  
  -- Analysis metadata
  analysis_model TEXT,                -- 'gemini-2.0-flash', 'gemini-2.0-flash-thinking', etc.
  analysis_version TEXT,              -- 'v5.0', 'v5.1', etc.
  deep_reasoning_used BOOLEAN DEFAULT true,
  rag_examples_count INTEGER DEFAULT 0, -- How many RAG examples were injected
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_correction_at TIMESTAMPTZ
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_humor_analysis_video ON video_humor_analysis(video_id);
CREATE INDEX IF NOT EXISTS idx_humor_analysis_type ON video_humor_analysis(humor_type);
CREATE INDEX IF NOT EXISTS idx_humor_analysis_needs_review ON video_humor_analysis(needs_review) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS idx_humor_analysis_confidence ON video_humor_analysis(confidence_score);
CREATE INDEX IF NOT EXISTS idx_humor_analysis_created ON video_humor_analysis(created_at DESC);

-- Unique constraint: one humor analysis per video (latest wins, or upsert)
CREATE UNIQUE INDEX IF NOT EXISTS idx_humor_analysis_unique_video ON video_humor_analysis(video_id);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_humor_analysis_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS humor_analysis_updated_at ON video_humor_analysis;
CREATE TRIGGER humor_analysis_updated_at
  BEFORE UPDATE ON video_humor_analysis
  FOR EACH ROW
  EXECUTE FUNCTION update_humor_analysis_timestamp();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Upsert humor analysis for a video
CREATE OR REPLACE FUNCTION upsert_humor_analysis(
  p_video_id UUID,
  p_gemini_analysis JSONB,
  p_humor_type TEXT DEFAULT NULL,
  p_humor_mechanism TEXT DEFAULT NULL,
  p_comedy_timing_score INTEGER DEFAULT NULL,
  p_is_humorous BOOLEAN DEFAULT NULL,
  p_joke_structure JSONB DEFAULT NULL,
  p_summary TEXT DEFAULT NULL,
  p_replicability_template TEXT DEFAULT NULL,
  p_replicability_score INTEGER DEFAULT NULL,
  p_required_elements TEXT[] DEFAULT NULL,
  p_analysis_model TEXT DEFAULT 'gemini-2.0-flash',
  p_analysis_version TEXT DEFAULT 'v5.0',
  p_deep_reasoning_used BOOLEAN DEFAULT true,
  p_rag_examples_count INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO video_humor_analysis (
    video_id, gemini_analysis, humor_type, humor_mechanism, comedy_timing_score,
    is_humorous, joke_structure, summary, replicability_template, replicability_score,
    required_elements, analysis_model, analysis_version, deep_reasoning_used, rag_examples_count
  )
  VALUES (
    p_video_id, p_gemini_analysis, p_humor_type, p_humor_mechanism, p_comedy_timing_score,
    p_is_humorous, p_joke_structure, p_summary, p_replicability_template, p_replicability_score,
    p_required_elements, p_analysis_model, p_analysis_version, p_deep_reasoning_used, p_rag_examples_count
  )
  ON CONFLICT (video_id) DO UPDATE SET
    gemini_analysis = EXCLUDED.gemini_analysis,
    humor_type = COALESCE(EXCLUDED.humor_type, video_humor_analysis.humor_type),
    humor_mechanism = COALESCE(EXCLUDED.humor_mechanism, video_humor_analysis.humor_mechanism),
    comedy_timing_score = COALESCE(EXCLUDED.comedy_timing_score, video_humor_analysis.comedy_timing_score),
    is_humorous = COALESCE(EXCLUDED.is_humorous, video_humor_analysis.is_humorous),
    joke_structure = COALESCE(EXCLUDED.joke_structure, video_humor_analysis.joke_structure),
    summary = COALESCE(EXCLUDED.summary, video_humor_analysis.summary),
    replicability_template = COALESCE(EXCLUDED.replicability_template, video_humor_analysis.replicability_template),
    replicability_score = COALESCE(EXCLUDED.replicability_score, video_humor_analysis.replicability_score),
    required_elements = COALESCE(EXCLUDED.required_elements, video_humor_analysis.required_elements),
    analysis_model = EXCLUDED.analysis_model,
    analysis_version = EXCLUDED.analysis_version,
    deep_reasoning_used = EXCLUDED.deep_reasoning_used,
    rag_examples_count = EXCLUDED.rag_examples_count,
    updated_at = NOW()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Add a correction to humor analysis
CREATE OR REPLACE FUNCTION add_humor_correction(
  p_video_id UUID,
  p_field TEXT,
  p_original_value TEXT,
  p_corrected_value TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE video_humor_analysis
  SET 
    human_corrections = human_corrections || jsonb_build_array(jsonb_build_object(
      'field', p_field,
      'original', p_original_value,
      'corrected', p_corrected_value,
      'notes', p_notes,
      'corrected_at', NOW()
    )),
    correction_count = correction_count + 1,
    last_correction_at = NOW(),
    -- Decrease confidence when corrections are needed
    confidence_score = GREATEST(confidence_score - 0.1, 0.1)
  WHERE video_id = p_video_id;
  
  RETURN FOUND;
END;
$$;

-- Get videos needing humor review (low confidence or flagged)
CREATE OR REPLACE FUNCTION get_humor_review_queue(
  p_limit INTEGER DEFAULT 20,
  p_confidence_threshold FLOAT DEFAULT 0.6
)
RETURNS TABLE (
  id UUID,
  video_id UUID,
  video_url TEXT,
  humor_type TEXT,
  humor_mechanism TEXT,
  confidence_score FLOAT,
  correction_count INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ha.id,
    ha.video_id,
    av.video_url,
    ha.humor_type,
    ha.humor_mechanism,
    ha.confidence_score,
    ha.correction_count,
    ha.created_at
  FROM video_humor_analysis ha
  JOIN analyzed_videos av ON ha.video_id = av.id
  WHERE ha.needs_review = true 
     OR ha.confidence_score < p_confidence_threshold
  ORDER BY ha.confidence_score ASC, ha.created_at DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE video_humor_analysis ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to humor analysis"
  ON video_humor_analysis
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can read humor analysis"
  ON video_humor_analysis
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow anon to read (for public API if needed)
CREATE POLICY "Anon users can read humor analysis"
  ON video_humor_analysis
  FOR SELECT
  USING (true);

COMMENT ON TABLE video_humor_analysis IS 
'Stores modular humor analysis for videos. Separate from main video data to allow focused iteration on humor understanding. Linked to analyzed_videos via video_id.';
