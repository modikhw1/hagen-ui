-- ============================================================================
-- BRAND ANALYSIS SCHEMA
-- ============================================================================
-- Created: December 10, 2025
-- Purpose: Store brand analysis for videos - personality and statement signals
--
-- This enables:
-- 1. Storing human interpretations of brand signals per video
-- 2. Storing AI-generated brand analysis (Gemini Vertex)
-- 3. RAG-based similarity search for brand analysis
-- 4. Training data export for model improvement
-- 5. Future: Profile-level brand aggregation
-- ============================================================================

-- ============================================================================
-- TABLE: video_brand_ratings
-- Stores human interpretation of brand signals per video
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_brand_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Link to analyzed video
    video_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,
    
    -- LEGACY: Human interpretation (free-form text) - kept for backwards compatibility
    -- "Who is this brand if it were a person?"
    personality_notes TEXT NOT NULL DEFAULT '',
    
    -- "What is the brand really saying? What's the subtext?"
    statement_notes TEXT NOT NULL DEFAULT '',
    
    -- NEW: Three-dimensional brand analysis
    -- 1. Survival instinct (1-10): Low = abundance mindset, High = scarcity-driven
    survival_score INTEGER CHECK (survival_score >= 1 AND survival_score <= 10) DEFAULT 5,
    survival_notes TEXT DEFAULT '',
    
    -- 2. Social positioning (1-10): Low = follower/uncool, High = leader/cool
    coolness_score INTEGER CHECK (coolness_score >= 1 AND coolness_score <= 10) DEFAULT 5,
    coolness_notes TEXT DEFAULT '',
    
    -- 3. Target audience age range (12-65)
    target_age_min INTEGER CHECK (target_age_min >= 12 AND target_age_min <= 65) DEFAULT 18,
    target_age_max INTEGER CHECK (target_age_max >= 12 AND target_age_max <= 65) DEFAULT 35,
    audience_notes TEXT DEFAULT '',
    
    -- AI-generated brand analysis (Gemini Vertex output)
    -- Structure will evolve through training
    ai_analysis JSONB DEFAULT NULL,
    
    -- Human corrections to AI analysis (for training)
    corrections TEXT DEFAULT NULL,
    
    -- Extracted signals (structured, can be AI or human)
    extracted_signals JSONB DEFAULT NULL,
    
    -- Embedding for RAG similarity search
    -- Uses same embedding model as video content
    brand_embedding vector(1536),
    
    -- Reference to similar videos for context
    similar_videos JSONB DEFAULT '[]',
    
    -- Training export tracking
    training_exported BOOLEAN DEFAULT FALSE,
    exported_at TIMESTAMPTZ DEFAULT NULL,
    
    -- Who rated this
    rater_id TEXT NOT NULL DEFAULT 'primary',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Only one brand rating per video per rater
    UNIQUE(video_id, rater_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_video_brand_ratings_video_id 
    ON video_brand_ratings(video_id);

CREATE INDEX IF NOT EXISTS idx_video_brand_ratings_rater_id 
    ON video_brand_ratings(rater_id);

CREATE INDEX IF NOT EXISTS idx_video_brand_ratings_created_at 
    ON video_brand_ratings(created_at DESC);

-- Index for finding unrated videos
CREATE INDEX IF NOT EXISTS idx_video_brand_ratings_training_exported 
    ON video_brand_ratings(training_exported) 
    WHERE training_exported = FALSE;

-- Vector similarity index for RAG
CREATE INDEX IF NOT EXISTS idx_video_brand_ratings_embedding 
    ON video_brand_ratings 
    USING ivfflat (brand_embedding vector_cosine_ops)
    WITH (lists = 100);

-- ============================================================================
-- FUNCTION: Update timestamp trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_video_brand_ratings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_video_brand_ratings_updated_at ON video_brand_ratings;

CREATE TRIGGER trigger_update_video_brand_ratings_updated_at
    BEFORE UPDATE ON video_brand_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_video_brand_ratings_updated_at();

-- ============================================================================
-- FUNCTION: Find similar brand ratings (RAG)
-- ============================================================================

CREATE OR REPLACE FUNCTION find_similar_brand_ratings(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    video_id UUID,
    video_url TEXT,
    personality_notes TEXT,
    statement_notes TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vbr.id,
        vbr.video_id,
        av.video_url,
        vbr.personality_notes,
        vbr.statement_notes,
        1 - (vbr.brand_embedding <=> query_embedding) as similarity
    FROM video_brand_ratings vbr
    JOIN analyzed_videos av ON av.id = vbr.video_id
    WHERE vbr.brand_embedding IS NOT NULL
      AND 1 - (vbr.brand_embedding <=> query_embedding) > match_threshold
    ORDER BY vbr.brand_embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================================================
-- VIEW: Videos with brand ratings
-- ============================================================================

CREATE OR REPLACE VIEW videos_with_brand_ratings AS
SELECT 
    av.id,
    av.video_url,
    av.video_id,
    av.platform,
    av.metadata,
    av.visual_analysis,
    vbr.id as brand_rating_id,
    vbr.personality_notes,
    vbr.statement_notes,
    vbr.ai_analysis as brand_ai_analysis,
    vbr.corrections as brand_corrections,
    vbr.extracted_signals,
    vbr.created_at as brand_rated_at,
    -- Also include standard video rating if exists
    vr.overall_score,
    vr.notes as rating_notes,
    vr.rated_at
FROM analyzed_videos av
LEFT JOIN video_brand_ratings vbr ON vbr.video_id = av.id AND vbr.rater_id = 'primary'
LEFT JOIN video_ratings vr ON vr.video_id = av.id AND vr.rater_id = 'primary';

-- ============================================================================
-- TABLE: creator_brand_profiles (Future: Profile-level analysis)
-- ============================================================================

-- Placeholder for future profile-level brand analysis
-- This will aggregate brand signals across all videos from a creator

CREATE TABLE IF NOT EXISTS creator_brand_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Creator identification
    platform TEXT NOT NULL,
    handle TEXT NOT NULL,
    profile_url TEXT,
    
    -- The synthesized brand (JSON representation of Brand object)
    brand JSONB DEFAULT '{}',
    
    -- Self-perception summary
    self_perception_summary TEXT,
    
    -- Statement summary (aggregate of all content)
    statement_summary TEXT,
    
    -- Videos used to build this profile
    analyzed_videos JSONB DEFAULT '[]',
    
    -- Consistency metrics
    consistency_scores JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One profile per platform/handle
    UNIQUE(platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_creator_brand_profiles_platform_handle 
    ON creator_brand_profiles(platform, handle);

-- ============================================================================
-- RLS Policies (if needed)
-- ============================================================================

-- For now, allow all operations (single user system)
-- Add RLS when multi-user support is needed

ALTER TABLE video_brand_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_brand_profiles ENABLE ROW LEVEL SECURITY;

-- Public access for now
DROP POLICY IF EXISTS "Allow all for video_brand_ratings" ON video_brand_ratings;
CREATE POLICY "Allow all for video_brand_ratings" ON video_brand_ratings
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for creator_brand_profiles" ON creator_brand_profiles;
CREATE POLICY "Allow all for creator_brand_profiles" ON creator_brand_profiles
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE video_brand_ratings IS 
'Stores brand analysis for individual videos - both human interpretation and AI analysis. Uses three-dimensional analysis: Survival (scarcity vs abundance), Coolness (social positioning), and Target Audience (age range).';

COMMENT ON COLUMN video_brand_ratings.personality_notes IS 
'LEGACY: Free-form interpretation: Who is this brand if it were a person?';

COMMENT ON COLUMN video_brand_ratings.statement_notes IS 
'LEGACY: Free-form interpretation: What is the brand really saying? Subtext?';

COMMENT ON COLUMN video_brand_ratings.survival_score IS 
'Survival instinct rating (1-10): 1 = abundance/security mindset, 10 = scarcity-driven/outcome obsessed';

COMMENT ON COLUMN video_brand_ratings.survival_notes IS 
'Observations about survival signals: video quality, structure, consistency, prioritization mindset';

COMMENT ON COLUMN video_brand_ratings.coolness_score IS 
'Social positioning (1-10): 1 = follower/uncool, 10 = leader/cool with frame control';

COMMENT ON COLUMN video_brand_ratings.coolness_notes IS 
'Observations about social signals: frame control, outcome independence, energy generation';

COMMENT ON COLUMN video_brand_ratings.target_age_min IS 
'Minimum target audience age (12-65)';

COMMENT ON COLUMN video_brand_ratings.target_age_max IS 
'Maximum target audience age (12-65)';

COMMENT ON COLUMN video_brand_ratings.audience_notes IS 
'Observations about humor type and target audience: cringe factor, self-deprecation, sophistication level';

COMMENT ON COLUMN video_brand_ratings.ai_analysis IS 
'AI-generated brand analysis from Gemini Vertex (structure evolves through training)';

COMMENT ON COLUMN video_brand_ratings.corrections IS 
'Human corrections to AI analysis for model training';

COMMENT ON TABLE creator_brand_profiles IS 
'Future: Aggregated brand profile from multiple videos from a creator';
