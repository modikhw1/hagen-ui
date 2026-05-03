-- Migration: 014_fingerprint_v1.1_signals
-- Purpose: Add new columns for replicability, risk level, environment, and target audience signals
-- Date: December 15, 2025

-- =============================================================================
-- Add structured replicability signals to video_brand_ratings
-- =============================================================================

ALTER TABLE video_brand_ratings
ADD COLUMN IF NOT EXISTS replicability_signals JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS risk_level_signals JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS environment_signals JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS audience_signals JSONB DEFAULT NULL;

-- Add index for filtering by replicability
CREATE INDEX IF NOT EXISTS idx_video_brand_ratings_actor_count 
ON video_brand_ratings ((replicability_signals->>'actor_count'));

-- Add index for filtering by environment
CREATE INDEX IF NOT EXISTS idx_video_brand_ratings_setting_type 
ON video_brand_ratings ((environment_signals->>'setting_type'));

-- Add index for filtering by risk level
CREATE INDEX IF NOT EXISTS idx_video_brand_ratings_content_edge 
ON video_brand_ratings ((risk_level_signals->>'content_edge'));

-- =============================================================================
-- Add brand fingerprint storage
-- =============================================================================

CREATE TABLE IF NOT EXISTS brand_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Core fingerprint data
  target_audience JSONB NOT NULL,
  operational_constraints JSONB NOT NULL,
  environment_availability JSONB NOT NULL,
  tone_preferences JSONB NOT NULL,
  risk_tolerance JSONB NOT NULL,
  ambition_level JSONB NOT NULL,
  
  -- Optional embedding from brand's existing content
  content_embedding VECTOR(1536),
  
  -- Narrative summary from brand profiling
  narrative_summary TEXT,
  
  -- Confidence score
  confidence FLOAT DEFAULT 0.5,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique brand fingerprints (latest wins)
  CONSTRAINT unique_brand_fingerprint UNIQUE (brand_id)
);

-- Index for brand lookup
CREATE INDEX IF NOT EXISTS idx_brand_fingerprints_brand_id 
ON brand_fingerprints (brand_id);

-- =============================================================================
-- Add video fingerprint cache (optional - for pre-computed fingerprints)
-- =============================================================================

CREATE TABLE IF NOT EXISTS video_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Core fingerprint data
  format JSONB NOT NULL,
  replicability JSONB NOT NULL,
  audience_signals JSONB NOT NULL,
  tone_profile JSONB NOT NULL,
  environment_requirements JSONB NOT NULL,
  risk_level JSONB NOT NULL,
  quality_baseline JSONB NOT NULL,
  
  -- Embedding reference (uses analyzed_videos.content_embedding)
  
  -- Confidence score
  confidence FLOAT DEFAULT 0.5,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique video fingerprints (latest wins)
  CONSTRAINT unique_video_fingerprint UNIQUE (video_id)
);

-- Index for video lookup
CREATE INDEX IF NOT EXISTS idx_video_fingerprints_video_id 
ON video_fingerprints (video_id);

-- =============================================================================
-- Add match history for calibration tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS match_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL,
  
  -- Match results
  passes_filters BOOLEAN NOT NULL,
  filter_results JSONB NOT NULL,
  soft_scores JSONB,
  overall_score FLOAT,
  explanation TEXT,
  
  -- Ground truth (for calibration)
  human_rating FLOAT, -- 0-1, null if not yet rated
  human_notes TEXT,
  
  -- Timestamps
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  rated_at TIMESTAMPTZ,
  
  -- Indexes for analysis
  CONSTRAINT unique_match UNIQUE (video_id, brand_id)
);

-- Index for calibration queries
CREATE INDEX IF NOT EXISTS idx_match_history_brand_id 
ON match_history (brand_id);

CREATE INDEX IF NOT EXISTS idx_match_history_rated 
ON match_history (human_rating) WHERE human_rating IS NOT NULL;

-- =============================================================================
-- Update trigger for updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_brand_fingerprints_updated_at
    BEFORE UPDATE ON brand_fingerprints
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_fingerprints_updated_at
    BEFORE UPDATE ON video_fingerprints
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON TABLE brand_fingerprints IS 'Brand fingerprints capturing what brands WANT from content (preferences, constraints, aspirations)';
COMMENT ON TABLE video_fingerprints IS 'Video fingerprints capturing what videos ARE (objective characteristics)';
COMMENT ON TABLE match_history IS 'History of video-brand matches for calibration and analysis';

COMMENT ON COLUMN video_brand_ratings.replicability_signals IS 'Replicability assessment: actor_count, setup_complexity, skill_required, etc.';
COMMENT ON COLUMN video_brand_ratings.risk_level_signals IS 'Risk level assessment: content_edge, humor_risk, controversy_potential';
COMMENT ON COLUMN video_brand_ratings.environment_signals IS 'Environment requirements: setting_type, space, lighting, noise';
COMMENT ON COLUMN video_brand_ratings.audience_signals IS 'Target audience signals: age, income, lifestyle, occasion';
