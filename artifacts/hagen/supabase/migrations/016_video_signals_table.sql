-- Migration 016: Create video_signals table (3-layer architecture)
-- This creates the new unified signals table that replaces the scattered
-- video_ratings, video_brand_ratings, and video_fingerprints tables.

-- =============================================================================
-- LAYER A SUPPORT: video_insights (optional rich metadata storage)
-- =============================================================================

CREATE TABLE IF NOT EXISTS video_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,
    
    -- Raw insights from various sources
    gemini_insights JSONB,          -- Raw Gemini analysis output
    youtube_metadata JSONB,         -- YouTube API data (title, description, etc.)
    transcript TEXT,                -- Full transcript if available
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One insights row per video
    UNIQUE(video_id)
);

-- =============================================================================
-- LAYER B & C: video_signals (extracted signals + computed values)
-- =============================================================================

CREATE TABLE IF NOT EXISTS video_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,
    brand_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
    
    -- Schema versioning (critical for migrations)
    schema_version TEXT NOT NULL DEFAULT 'v1.1',
    
    -- LAYER B: Extracted signals (from Gemini output)
    extracted JSONB NOT NULL DEFAULT '{}',
    
    -- LAYER B: Human overrides (user corrections)
    human_overrides JSONB DEFAULT '{}',
    
    -- LAYER B: Rating metadata
    rating INTEGER CHECK (rating >= 1 AND rating <= 10),
    rating_confidence TEXT CHECK (rating_confidence IN ('low', 'medium', 'high')),
    notes TEXT,
    
    -- LAYER C: Computed values (always re-derivable)
    embedding vector(1536),         -- OpenAI text-embedding-3-small
    fingerprint JSONB,              -- Computed fingerprint object
    
    -- Source tracking
    source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'migration')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One signal row per video per brand (allows multiple brands to rate same video)
    UNIQUE(video_id, brand_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Fast lookup by video
CREATE INDEX IF NOT EXISTS idx_video_signals_video_id ON video_signals(video_id);

-- Fast lookup by brand
CREATE INDEX IF NOT EXISTS idx_video_signals_brand_id ON video_signals(brand_id);

-- Schema version filtering (for migrations)
CREATE INDEX IF NOT EXISTS idx_video_signals_schema_version ON video_signals(schema_version);

-- Vector similarity search (CRITICAL for profile matching)
CREATE INDEX IF NOT EXISTS idx_video_signals_embedding ON video_signals 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- JSONB indexing for signal queries
CREATE INDEX IF NOT EXISTS idx_video_signals_extracted ON video_signals USING gin(extracted);

-- Video insights lookup
CREATE INDEX IF NOT EXISTS idx_video_insights_video_id ON video_insights(video_id);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to find similar videos using the new video_signals table
CREATE OR REPLACE FUNCTION find_similar_videos_v2(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10,
    filter_brand_id uuid DEFAULT NULL
)
RETURNS TABLE (
    video_id uuid,
    signal_id uuid,
    similarity float,
    extracted jsonb,
    fingerprint jsonb,
    rating integer,
    video_url text,
    title text
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vs.video_id,
        vs.id as signal_id,
        1 - (vs.embedding <=> query_embedding) as similarity,
        vs.extracted,
        vs.fingerprint,
        vs.rating,
        av.video_url,
        av.title
    FROM video_signals vs
    JOIN analyzed_videos av ON av.id = vs.video_id
    WHERE 
        vs.embedding IS NOT NULL
        AND (filter_brand_id IS NULL OR vs.brand_id = filter_brand_id)
        AND 1 - (vs.embedding <=> query_embedding) > match_threshold
    ORDER BY vs.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function to get merged signals (extracted + human_overrides)
CREATE OR REPLACE FUNCTION get_merged_signals(signal_row video_signals)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Human overrides take precedence over extracted values
    RETURN signal_row.extracted || COALESCE(signal_row.human_overrides, '{}'::jsonb);
END;
$$;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_video_signals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_video_signals_updated_at
    BEFORE UPDATE ON video_signals
    FOR EACH ROW
    EXECUTE FUNCTION update_video_signals_timestamp();

CREATE TRIGGER trigger_video_insights_updated_at
    BEFORE UPDATE ON video_insights
    FOR EACH ROW
    EXECUTE FUNCTION update_video_signals_timestamp();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE video_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_insights ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to video_signals" ON video_signals
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to video_insights" ON video_insights
    FOR ALL USING (auth.role() = 'service_role');

-- Allow authenticated users to read all signals (for profile matching)
CREATE POLICY "Authenticated users can read video_signals" ON video_signals
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read video_insights" ON video_insights
    FOR SELECT USING (auth.role() = 'authenticated');

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE video_signals IS 'Unified table for video signals, ratings, and computed values (3-layer architecture)';
COMMENT ON COLUMN video_signals.schema_version IS 'Signal schema version (v1.0, v1.1, etc.) for migration tracking';
COMMENT ON COLUMN video_signals.extracted IS 'Signals extracted from Gemini output by SignalExtractor';
COMMENT ON COLUMN video_signals.human_overrides IS 'User corrections that override extracted values';
COMMENT ON COLUMN video_signals.embedding IS 'OpenAI text-embedding-3-small vector for similarity search';
COMMENT ON COLUMN video_signals.fingerprint IS 'Computed fingerprint object for brand matching';

COMMENT ON TABLE video_insights IS 'Layer A immutable storage for raw analysis outputs';
