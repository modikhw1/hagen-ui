-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Main table: analyzed videos with rich data
CREATE TABLE IF NOT EXISTS analyzed_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source
  platform TEXT NOT NULL, -- 'tiktok', 'youtube', etc.
  video_url TEXT NOT NULL UNIQUE,
  video_id TEXT NOT NULL,
  
  -- Raw data from APIs (swappable sources)
  metadata JSONB, -- From Supadata or any metadata provider
  visual_analysis JSONB, -- From Gemini or any video analysis tool
  audio_analysis JSONB, -- From Gemini or separate audio tool
  
  -- User ratings (dynamic schema - can evolve)
  user_ratings JSONB DEFAULT '{}',
  user_tags TEXT[] DEFAULT '{}',
  user_notes TEXT,
  
  -- Schema metadata (tracks evolution)
  rating_schema_version INTEGER DEFAULT 1,
  
  -- Embeddings (swappable embedding model)
  content_embedding vector(1536), -- OpenAI text-embedding-3-small dimension (or ada-002)
  
  -- Calculated metrics (can be regenerated)
  computed_scores JSONB, -- engagement_rate, freshness_score, etc.
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  analyzed_at TIMESTAMPTZ,
  rated_at TIMESTAMPTZ,
  
  -- Indexing
  CONSTRAINT unique_video_url UNIQUE(video_url)
);

-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_analyzed_videos_embedding ON analyzed_videos USING ivfflat (content_embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_platform ON analyzed_videos(platform);
CREATE INDEX IF NOT EXISTS idx_created_at ON analyzed_videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rating_schema_version ON analyzed_videos(rating_schema_version);

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_user_ratings ON analyzed_videos USING GIN (user_ratings);
CREATE INDEX IF NOT EXISTS idx_metadata ON analyzed_videos USING GIN (metadata);

-- Full text search on notes
CREATE INDEX IF NOT EXISTS idx_user_notes_fts ON analyzed_videos USING GIN (to_tsvector('english', user_notes));

-- Table: Rating schema evolution history
CREATE TABLE IF NOT EXISTS rating_schema_versions (
  version INTEGER PRIMARY KEY,
  schema_definition JSONB NOT NULL, -- { "overallQuality": "number", "hookStrength": "number", ... }
  parent_version INTEGER REFERENCES rating_schema_versions(version),
  changes JSONB, -- { "added": ["field1"], "removed": ["field2"], "modified": [...] }
  created_by TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Insert initial schema version
INSERT INTO rating_schema_versions (version, schema_definition, notes) VALUES
(1, '{
  "overallQuality": {"type": "number", "min": 1, "max": 10, "description": "Overall content quality"},
  "engagementPotential": {"type": "number", "min": 1, "max": 10, "description": "Predicted engagement"}
}', 'Initial rating schema with basic criteria')
ON CONFLICT (version) DO NOTHING;

-- Table: AI-discovered patterns
CREATE TABLE IF NOT EXISTS discovered_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL, -- 'correlation', 'suggestion', 'insight'
  pattern_data JSONB NOT NULL, -- Flexible structure for different pattern types
  confidence REAL, -- 0.0 to 1.0
  supporting_video_ids UUID[] DEFAULT '{}', -- Videos that support this pattern
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
  user_feedback TEXT,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pattern_status ON discovered_patterns(status);
CREATE INDEX IF NOT EXISTS idx_discovered_at ON discovered_patterns(discovered_at DESC);

-- Table: Computed metrics cache (regenerable)
CREATE TABLE IF NOT EXISTS video_metrics (
  video_id UUID PRIMARY KEY REFERENCES analyzed_videos(id) ON DELETE CASCADE,
  
  -- Engagement metrics
  engagement_rate REAL,
  viral_score REAL,
  freshness_score REAL,
  
  -- Content metrics
  avg_scene_duration REAL,
  color_diversity_score REAL,
  audio_energy_level REAL,
  
  -- Custom calculated fields (extensible)
  custom_metrics JSONB DEFAULT '{}',
  
  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  calculation_version INTEGER DEFAULT 1
);

-- Enable Row Level Security (optional, for multi-user later)
ALTER TABLE analyzed_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_schema_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovered_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_metrics ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (single user)
DROP POLICY IF EXISTS "Allow all for authenticated users" ON analyzed_videos;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON rating_schema_versions;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON discovered_patterns;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON video_metrics;

CREATE POLICY "Allow all for authenticated users" ON analyzed_videos FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON rating_schema_versions FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON discovered_patterns FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON video_metrics FOR ALL USING (true);

-- Function: Find similar videos using pgvector
CREATE OR REPLACE FUNCTION find_similar_videos(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 10,
  exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  video_url text,
  platform text,
  metadata jsonb,
  user_ratings jsonb,
  user_tags text[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    av.id,
    av.video_url,
    av.platform,
    av.metadata,
    av.user_ratings,
    av.user_tags,
    1 - (av.content_embedding <=> query_embedding) as similarity
  FROM analyzed_videos av
  WHERE av.content_embedding IS NOT NULL
    AND (exclude_id IS NULL OR av.id != exclude_id)
    AND (av.content_embedding <=> query_embedding) < match_threshold
  ORDER BY av.content_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Views for common queries
CREATE OR REPLACE VIEW rated_videos AS
SELECT 
  av.*,
  vm.engagement_rate,
  vm.viral_score,
  vm.freshness_score
FROM analyzed_videos av
LEFT JOIN video_metrics vm ON av.id = vm.video_id
WHERE av.user_ratings IS NOT NULL AND av.user_ratings != '{}'::jsonb;

CREATE OR REPLACE VIEW pending_rating_videos AS
SELECT * FROM analyzed_videos
WHERE user_ratings IS NULL OR user_ratings = '{}'::jsonb
ORDER BY created_at DESC;

-- Comments
COMMENT ON TABLE analyzed_videos IS 'Main table storing videos with rich analysis and user ratings. JSONB fields allow schema evolution without migrations.';
COMMENT ON TABLE rating_schema_versions IS 'Tracks evolution of rating criteria over time. Enables dynamic schema changes.';
COMMENT ON TABLE discovered_patterns IS 'AI-discovered patterns in user ratings. Suggests new rating dimensions.';
COMMENT ON TABLE video_metrics IS 'Computed metrics cache. Can be regenerated from raw data.';
COMMENT ON FUNCTION find_similar_videos IS 'Find videos similar to a given embedding using cosine similarity';
