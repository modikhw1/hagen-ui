-- Brand Profiling System
-- Conversational AI for understanding customer brand identity, tone, and goals
-- Designed to create meaning clusters that can match against video content

-- ============================================================================
-- BRAND PROFILES
-- Core table storing the synthesized brand identity
-- ============================================================================

CREATE TABLE IF NOT EXISTS brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic Info
  name TEXT NOT NULL,
  business_type TEXT, -- e.g., 'cafe', 'retail', 'service', 'saas'
  
  -- Extracted Characteristics (from conversation analysis)
  characteristics JSONB DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "team_size": "small" | "medium" | "large",
  --   "business_age": "startup" | "established" | "legacy",
  --   "owner_background": "professional-pivot" | "industry-native" | "entrepreneur",
  --   "social_media_experience": "beginner" | "intermediate" | "advanced",
  --   "content_creation_capacity": "limited" | "moderate" | "dedicated",
  --   "brand_personality_inferred": ["approachable", "professional", "playful", etc]
  -- }
  
  -- Tone Profile
  tone JSONB DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "primary": "casual" | "professional" | "playful" | "inspirational" | "edgy",
  --   "secondary": [...],
  --   "avoid": ["corporate-speak", "overly-salesy", etc],
  --   "energy_level": 1-10,
  --   "humor_tolerance": 1-10,
  --   "formality": 1-10
  -- }
  
  -- Current State (what the brand IS now)
  current_state JSONB DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "visual_identity_established": boolean,
  --   "voice_consistency": "none" | "emerging" | "established",
  --   "audience_clarity": "unclear" | "somewhat-clear" | "well-defined",
  --   "content_history": "none" | "sporadic" | "regular",
  --   "platform_presence": ["instagram", "tiktok", etc]
  -- }
  
  -- Goals & Aspirations
  goals JSONB DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "business_goals": ["increase-awareness", "drive-sales", "build-community"],
  --   "social_media_goals": ["grow-following", "engagement", "brand-recognition"],
  --   "content_aspirations": ["educational", "entertaining", "behind-scenes"],
  --   "timeline": "immediate" | "quarter" | "year"
  -- }
  
  -- Target Audience (as understood by the customer)
  target_audience JSONB DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "demographics": { "age_range": "18-35", "gender": "any", ... },
  --   "psychographics": ["health-conscious", "trend-aware", ...],
  --   "behaviors": ["mobile-first", "impulse-buyers", ...]
  -- }
  
  -- Reference Videos (videos they admire or want to emulate)
  reference_videos JSONB DEFAULT '[]'::jsonb,
  -- Array of:
  -- {
  --   "url": "...",
  --   "platform": "tiktok" | "youtube" | "instagram",
  --   "why_admired": "...",
  --   "analyzed_video_id": uuid | null (if we've analyzed it)
  -- }
  
  -- AI Synthesis
  conversation_synthesis TEXT, -- Full narrative summary from conversation
  key_insights TEXT[], -- Array of key takeaways
  
  -- Embedding for similarity matching with videos
  embedding vector(1536),
  
  -- Metadata
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'complete', 'archived'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_brand_profiles_user ON brand_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_brand_profiles_status ON brand_profiles(status);
CREATE INDEX IF NOT EXISTS idx_brand_profiles_business_type ON brand_profiles(business_type);
CREATE INDEX IF NOT EXISTS idx_brand_profiles_embedding ON brand_profiles USING ivfflat (embedding vector_cosine_ops);

-- ============================================================================
-- BRAND CONVERSATIONS
-- Stores conversation sessions for brand discovery
-- ============================================================================

CREATE TABLE IF NOT EXISTS brand_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE CASCADE,
  
  -- Session state
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  current_phase TEXT DEFAULT 'introduction',
  -- Phases: introduction, business_story, goals, tone_discovery, audience, references, synthesis
  
  -- Accumulated insights (grows during conversation)
  accumulated_insights JSONB DEFAULT '{}'::jsonb,
  
  -- Conversation metrics
  message_count INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_brand_conversations_profile ON brand_conversations(brand_profile_id);
CREATE INDEX IF NOT EXISTS idx_brand_conversations_status ON brand_conversations(status);

-- ============================================================================
-- BRAND CONVERSATION MESSAGES
-- Individual messages with extracted insights
-- ============================================================================

CREATE TABLE IF NOT EXISTS brand_conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES brand_conversations(id) ON DELETE CASCADE,
  
  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  
  -- Extracted insights from this specific message
  -- This is the "underlying answers" - what the message REVEALS, not just what it says
  extracted_insights JSONB DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "business_type_signals": [...],
  --   "experience_level_signals": [...],
  --   "tone_preference_signals": [...],
  --   "personality_signals": [...],
  --   "confidence": 0-1,
  --   "needs_clarification": ["aspect1", "aspect2"]
  -- }
  
  -- The phase this message belongs to
  phase TEXT,
  
  -- Token usage for this message
  tokens_used INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_messages_conversation ON brand_conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_brand_messages_role ON brand_conversation_messages(role);

-- ============================================================================
-- BRAND REFERENCE VIDEOS
-- Videos that customers link as examples they admire
-- Separate table for easier querying and linking to analyzed_videos
-- ============================================================================

CREATE TABLE IF NOT EXISTS brand_reference_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE CASCADE,
  
  -- Video reference
  video_url TEXT NOT NULL,
  platform TEXT, -- 'tiktok', 'youtube', 'instagram'
  
  -- Why they like it
  reason TEXT,
  aspects_admired TEXT[], -- ['humor', 'editing', 'authenticity', 'energy']
  
  -- Link to analyzed video if we've processed it
  analyzed_video_id UUID REFERENCES analyzed_videos(id) ON DELETE SET NULL,
  
  -- Tone extraction (lightweight analysis just for matching)
  extracted_tone JSONB DEFAULT '{}'::jsonb,
  -- {
  --   "energy": 1-10,
  --   "humor_level": 1-10,
  --   "production_style": "raw" | "polished" | "mixed",
  --   "content_type": "educational" | "entertainment" | "promotional",
  --   "tone_tags": ["casual", "energetic", ...]
  -- }
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_ref_videos_profile ON brand_reference_videos(brand_profile_id);
CREATE INDEX IF NOT EXISTS idx_brand_ref_videos_analyzed ON brand_reference_videos(analyzed_video_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Find videos matching a brand profile
CREATE OR REPLACE FUNCTION find_videos_for_brand(
  brand_profile_uuid UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  video_url TEXT,
  platform TEXT,
  title TEXT,
  similarity FLOAT,
  quality_tier TEXT,
  brand_tone_notes TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  brand_embedding vector(1536);
BEGIN
  -- Get the brand profile embedding
  SELECT bp.embedding INTO brand_embedding
  FROM brand_profiles bp
  WHERE bp.id = brand_profile_uuid;
  
  IF brand_embedding IS NULL THEN
    RAISE EXCEPTION 'Brand profile has no embedding';
  END IF;
  
  -- Find similar videos
  RETURN QUERY
  SELECT 
    av.id,
    av.video_url,
    av.platform,
    av.metadata->>'title' as title,
    1 - (av.embedding <=> brand_embedding) as similarity,
    vr.quality_tier,
    vr.brand_context as brand_tone_notes
  FROM analyzed_videos av
  LEFT JOIN video_ratings vr ON av.id = vr.video_id
  WHERE av.embedding IS NOT NULL
    AND 1 - (av.embedding <=> brand_embedding) > match_threshold
  ORDER BY av.embedding <=> brand_embedding
  LIMIT match_count;
END;
$$;

-- Update brand profile updated_at on changes
CREATE OR REPLACE FUNCTION update_brand_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brand_profiles_updated_at
  BEFORE UPDATE ON brand_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_brand_profile_timestamp();

CREATE TRIGGER brand_conversations_updated_at
  BEFORE UPDATE ON brand_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_brand_profile_timestamp();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE brand_profiles IS 'Core brand identity profiles built through conversational AI discovery';
COMMENT ON TABLE brand_conversations IS 'Conversation sessions for brand discovery dialogue';
COMMENT ON TABLE brand_conversation_messages IS 'Individual messages with extracted underlying insights';
COMMENT ON TABLE brand_reference_videos IS 'Videos customers link as examples they admire';

COMMENT ON COLUMN brand_profiles.characteristics IS 'AI-extracted business characteristics from conversation';
COMMENT ON COLUMN brand_profiles.tone IS 'Brand tone profile for content matching';
COMMENT ON COLUMN brand_profiles.embedding IS 'Vector embedding for similarity matching with video content';
COMMENT ON COLUMN brand_conversation_messages.extracted_insights IS 'Underlying insights - what the message reveals, not just what it says';
