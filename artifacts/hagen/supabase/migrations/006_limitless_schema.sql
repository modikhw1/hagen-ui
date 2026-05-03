-- Limitless Rating Schema
-- Removes fixed dimensions, lets AI extract criteria from natural language notes
-- Enables dynamic schema evolution based on user's actual evaluation patterns

-- ============================================================================
-- CORE RATINGS TABLE (v2)
-- ============================================================================
-- Simplified: just score + notes, AI extracts the rest
CREATE TABLE IF NOT EXISTS ratings_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES analyzed_videos(id) ON DELETE CASCADE,
  
  -- Your direct input (minimal)
  overall_score DECIMAL(3,2) CHECK (overall_score BETWEEN 0 AND 1),
  notes TEXT NOT NULL,  -- Your natural language reasoning (required)
  
  -- AI-extracted criteria (computed from notes)
  extracted_criteria JSONB DEFAULT '{}',
  extraction_model TEXT,  -- e.g., 'gpt-4o', 'claude-3-opus'
  extraction_confidence REAL CHECK (extraction_confidence BETWEEN 0 AND 1),
  
  -- Embedding for similarity search (notes + criteria combined)
  reasoning_embedding vector(1536),
  
  -- AI prediction at time of rating (for disagreement tracking)
  ai_prediction JSONB,
  
  -- Quick tags (optional, user-provided)
  tags TEXT[] DEFAULT '{}',
  
  -- Metadata
  rated_at TIMESTAMPTZ DEFAULT NOW(),
  rater_id TEXT DEFAULT 'primary',
  schema_version INTEGER DEFAULT 2,
  
  -- Ensure one rating per video per rater
  UNIQUE(video_id, rater_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_ratings_v2_video ON ratings_v2(video_id);
CREATE INDEX IF NOT EXISTS idx_ratings_v2_score ON ratings_v2(overall_score);
CREATE INDEX IF NOT EXISTS idx_ratings_v2_rated_at ON ratings_v2(rated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_v2_criteria ON ratings_v2 USING GIN (extracted_criteria);
CREATE INDEX IF NOT EXISTS idx_ratings_v2_tags ON ratings_v2 USING GIN (tags);

-- Vector index for similarity search
CREATE INDEX IF NOT EXISTS idx_ratings_v2_embedding ON ratings_v2 
  USING ivfflat (reasoning_embedding vector_cosine_ops) WITH (lists = 100);

-- Full text search on notes
CREATE INDEX IF NOT EXISTS idx_ratings_v2_notes_fts ON ratings_v2 
  USING GIN (to_tsvector('english', notes));

-- ============================================================================
-- DISCOVERED CRITERIA
-- ============================================================================
-- Track criteria that emerge from user's notes over time
CREATE TABLE IF NOT EXISTS discovered_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Criterion identification
  criterion_name TEXT UNIQUE NOT NULL,  -- e.g., 'replicability', 'acting_barrier'
  canonical_name TEXT,  -- Normalized name after user confirmation
  
  -- Learned from data
  frequency INTEGER DEFAULT 1,  -- How many times this appears
  avg_value REAL,  -- Average value when present
  value_type TEXT DEFAULT 'numeric',  -- 'numeric', 'categorical', 'boolean'
  typical_values JSONB,  -- For categorical: ["low", "medium", "high"]
  
  -- Correlation analysis
  correlation_with_score REAL,  -- -1 to 1: how does this predict overall score?
  predictive_power REAL,  -- 0 to 1: how reliable is this correlation?
  
  -- Related criteria (discovered clusters)
  related_criteria TEXT[] DEFAULT '{}',
  
  -- User confirmation
  is_confirmed BOOLEAN DEFAULT FALSE,
  user_description TEXT,  -- User's own definition
  user_weight REAL,  -- How important is this criterion? (user-set)
  
  -- Timestamps
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_criteria_frequency ON discovered_criteria(frequency DESC);
CREATE INDEX IF NOT EXISTS idx_criteria_confirmed ON discovered_criteria(is_confirmed);
CREATE INDEX IF NOT EXISTS idx_criteria_correlation ON discovered_criteria(correlation_with_score DESC);

-- ============================================================================
-- LEARNED PATTERNS
-- ============================================================================
-- Store discovered patterns about user's preferences
CREATE TABLE IF NOT EXISTS learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Pattern description
  pattern_type TEXT NOT NULL,  -- 'correlation', 'threshold', 'combination', 'insight'
  pattern_description TEXT NOT NULL,  -- Human-readable
  pattern_rule JSONB,  -- Machine-readable: {"if": {"acting_barrier": ">0.7"}, "then": {"score": "<0.5"}}
  
  -- Evidence
  supporting_video_ids UUID[] DEFAULT '{}',
  counter_example_ids UUID[] DEFAULT '{}',
  confidence REAL CHECK (confidence BETWEEN 0 AND 1),
  sample_size INTEGER,
  
  -- User feedback
  is_valid BOOLEAN,  -- User confirmed/rejected
  user_notes TEXT,
  
  -- Timestamps
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_patterns_type ON learned_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON learned_patterns(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_valid ON learned_patterns(is_valid);

-- ============================================================================
-- CRITERIA EXTRACTION LOG
-- ============================================================================
-- Track extraction history for debugging and improvement
CREATE TABLE IF NOT EXISTS extraction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id UUID REFERENCES ratings_v2(id) ON DELETE CASCADE,
  
  -- Input
  notes_text TEXT NOT NULL,
  
  -- Output
  extracted_criteria JSONB NOT NULL,
  model_used TEXT NOT NULL,
  confidence REAL,
  
  -- Timing
  extraction_time_ms INTEGER,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Quality tracking
  user_corrected BOOLEAN DEFAULT FALSE,
  corrected_criteria JSONB
);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Find similar ratings by embedding
CREATE OR REPLACE FUNCTION find_similar_ratings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5,
  exclude_video_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  video_id uuid,
  overall_score decimal,
  notes text,
  extracted_criteria jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.video_id,
    r.overall_score,
    r.notes,
    r.extracted_criteria,
    1 - (r.reasoning_embedding <=> query_embedding) as similarity
  FROM ratings_v2 r
  WHERE r.reasoning_embedding IS NOT NULL
    AND (exclude_video_id IS NULL OR r.video_id != exclude_video_id)
    AND (r.reasoning_embedding <=> query_embedding) < (1 - match_threshold)
  ORDER BY r.reasoning_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Update criteria statistics when a new rating is added
CREATE OR REPLACE FUNCTION update_criteria_stats(criteria JSONB)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  criterion_key TEXT;
  criterion_value JSONB;
BEGIN
  FOR criterion_key, criterion_value IN SELECT * FROM jsonb_each(criteria)
  LOOP
    INSERT INTO discovered_criteria (criterion_name, frequency, last_seen_at)
    VALUES (criterion_key, 1, NOW())
    ON CONFLICT (criterion_name) DO UPDATE
    SET 
      frequency = discovered_criteria.frequency + 1,
      last_seen_at = NOW();
  END LOOP;
END;
$$;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active criteria (frequently used, not rejected)
CREATE OR REPLACE VIEW active_criteria AS
SELECT 
  dc.*,
  CASE 
    WHEN dc.correlation_with_score > 0.3 THEN 'positive'
    WHEN dc.correlation_with_score < -0.3 THEN 'negative'
    ELSE 'neutral'
  END as score_relationship
FROM discovered_criteria dc
WHERE dc.frequency >= 3
  AND (dc.is_confirmed IS NULL OR dc.is_confirmed = TRUE)
ORDER BY dc.frequency DESC;

-- Ratings with video info
CREATE OR REPLACE VIEW ratings_with_videos AS
SELECT 
  r.*,
  av.video_url,
  av.platform,
  av.metadata,
  av.visual_analysis
FROM ratings_v2 r
JOIN analyzed_videos av ON r.video_id = av.id
ORDER BY r.rated_at DESC;

-- ============================================================================
-- MIGRATE EXISTING DATA (optional, run manually)
-- ============================================================================
-- This converts old video_ratings to new format
-- Run after confirming the new schema works

-- INSERT INTO ratings_v2 (video_id, overall_score, notes, tags, ai_prediction, rated_at, rater_id)
-- SELECT 
--   video_id,
--   overall_score,
--   COALESCE(notes, 'Dimensions: ' || dimensions::text),
--   tags,
--   ai_prediction,
--   rated_at,
--   rater_id
-- FROM video_ratings
-- ON CONFLICT (video_id, rater_id) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE ratings_v2 IS 'Limitless rating system: only score + notes required, AI extracts structured criteria';
COMMENT ON TABLE discovered_criteria IS 'Criteria that emerge from user notes over time, with learned correlations';
COMMENT ON TABLE learned_patterns IS 'Patterns discovered in user preferences, like "high acting requirement → low score"';
COMMENT ON COLUMN ratings_v2.extracted_criteria IS 'AI-extracted structured criteria from notes, e.g., {"replicability": 0.3, "humor_style": "absurdist"}';
COMMENT ON COLUMN ratings_v2.reasoning_embedding IS 'Vector embedding of notes + criteria for similarity search';
