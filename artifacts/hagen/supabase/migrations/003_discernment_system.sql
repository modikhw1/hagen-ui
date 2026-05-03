-- Discernment System Schema
-- Enables conversational video analysis with evolving preferences

-- Enable pgvector if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Main table: Discernment sessions (one per video analysis conversation)
CREATE TABLE IF NOT EXISTS discernment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User (optional for now)
  user_id UUID,
  
  -- Video being analyzed
  video_url TEXT NOT NULL,
  platform TEXT,
  
  -- Analysis data gathered
  video_metadata JSONB,              -- From Supadata
  gemini_analysis JSONB,             -- Multi-pass Gemini analysis
  
  -- Session state
  status TEXT DEFAULT 'active',      -- 'active', 'completed', 'archived'
  message_count INTEGER DEFAULT 0,
  
  -- Snapshots of user context at session start
  focus_areas_snapshot JSONB,
  directions_snapshot JSONB,
  
  -- Final synthesis
  final_synthesis JSONB,             -- AI's final understanding
  
  -- Embedding from entire conversation
  embedding vector(1536),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Conversation messages within a session
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES discernment_sessions(id) ON DELETE CASCADE,
  
  -- Message content
  role TEXT NOT NULL,                -- 'system', 'assistant', 'user'
  content TEXT NOT NULL,
  message_index INTEGER NOT NULL,    -- Order in conversation
  
  -- AI interpretation and learnings
  internal_notes JSONB,              -- What AI learned from this message
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_session ON conversation_messages(session_id, message_index);

-- User's vocabulary - terms and their meanings
CREATE TABLE IF NOT EXISTS user_vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  
  term TEXT NOT NULL,
  definition TEXT NOT NULL,          -- User's definition
  examples TEXT[],                   -- Video URLs or descriptions that exemplify this
  counter_examples TEXT[],           -- Things that are NOT this
  
  -- Source tracking
  source_session_id UUID REFERENCES discernment_sessions(id),
  confirmed BOOLEAN DEFAULT false,   -- Has user confirmed this definition?
  
  -- Usage tracking
  times_used INTEGER DEFAULT 1,
  last_used TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_user_term UNIQUE(user_id, term)
);

-- Focus areas - what the user cares about (evolves over time)
CREATE TABLE IF NOT EXISTS focus_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  
  area TEXT NOT NULL,                -- "authenticity of reactions", "hook payoff", etc.
  description TEXT,                  -- How to identify this
  importance_weight REAL DEFAULT 0.5, -- 0-1, increases with mentions
  
  -- What to look for
  positive_signals TEXT[],           -- Signs this is present
  negative_signals TEXT[],           -- Signs this is absent/violated
  
  -- Origin
  source_session_id UUID REFERENCES discernment_sessions(id),
  user_stated BOOLEAN DEFAULT false, -- Did user explicitly state this?
  ai_inferred BOOLEAN DEFAULT false, -- Did AI infer from patterns?
  
  -- Tracking
  times_referenced INTEGER DEFAULT 1,
  last_referenced TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_user_area UNIQUE(user_id, area)
);

-- Comparisons - when user compares videos
CREATE TABLE IF NOT EXISTS video_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  video_a_url TEXT NOT NULL,
  video_b_url TEXT NOT NULL,
  
  preference TEXT,                   -- 'A', 'B', 'neither', 'both', 'depends'
  reasoning TEXT NOT NULL,           -- User's explanation
  
  -- Extracted insights
  differentiating_factors JSONB,     -- What made the difference
  shared_qualities JSONB,            -- What they have in common
  
  session_id UUID REFERENCES discernment_sessions(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User directions - explicit guidelines
CREATE TABLE IF NOT EXISTS user_directions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  
  direction_type TEXT NOT NULL,      -- 'look_for', 'avoid', 'preference', 'rule'
  statement TEXT NOT NULL,           -- The actual direction
  
  -- Context
  applies_to TEXT DEFAULT 'all',     -- 'all', 'hooks', 'pacing', 'tone', etc.
  priority INTEGER DEFAULT 5,        -- 1-10, user can adjust
  confidence REAL DEFAULT 1.0,       -- How confident is this direction
  
  -- Status
  active BOOLEAN DEFAULT true,
  
  source_session_id UUID REFERENCES discernment_sessions(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Viral knowledge base - general principles about viral content
CREATE TABLE IF NOT EXISTS viral_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  category TEXT NOT NULL,            -- 'hooks', 'pacing', 'psychology', 'structure', 'sound'
  principle TEXT NOT NULL,           -- The knowledge
  explanation TEXT,
  
  -- Examples
  examples TEXT[],
  
  -- Source
  source TEXT,                       -- 'industry', 'research', 'user_added'
  
  -- Relevance to user
  user_relevance_score REAL DEFAULT 0.5,  -- Adjusted based on user's interests
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert some foundational viral knowledge
INSERT INTO viral_knowledge (category, principle, explanation, source) VALUES
-- Hooks
('hooks', 'Pattern interrupt in first 0.5 seconds', 'Viewers decide to stay or leave in milliseconds. Visual or audio pattern interrupt captures attention before conscious decision.', 'industry'),
('hooks', 'Curiosity gap without clickbait', 'Open a loop that MUST be closed, but ensure the content delivers on the implicit promise.', 'industry'),
('hooks', 'Identity-based hooks outperform curiosity', '"People like you..." or "If you''ve ever..." creates immediate relevance.', 'research'),

-- Pacing
('pacing', '2-3 second scene changes for entertainment', 'Attention spans require visual variety. Static shots lose viewers.', 'industry'),
('pacing', 'Slow pacing signals authority in educational', 'Rushed delivery undermines credibility for teaching content.', 'research'),
('pacing', 'Energy escalation toward CTA', 'Build energy through the video to peak at the ask.', 'industry'),

-- Psychology
('psychology', 'Parasocial intimacy through direct address', 'Speaking as if to one person creates connection.', 'research'),
('psychology', 'Vulnerability creates trust, but only if authentic', 'Manufactured vulnerability backfires when detected.', 'research'),
('psychology', 'Social proof must be implicit, not stated', 'Showing evidence beats claiming popularity.', 'industry'),

-- Structure
('structure', 'Hook → Tension → Payoff within 60 seconds', 'Complete narrative arc even in short content.', 'industry'),
('structure', 'Open loops every 15-20 seconds for retention', 'Create micro-cliffhangers throughout.', 'research'),

-- Sound
('sound', 'Audio hook often more important than visual', 'Many viewers scroll with sound on - audio pattern interrupt stops the scroll.', 'industry'),
('sound', 'Voice tone shift signals importance', 'Dropping or raising pitch marks key moments.', 'industry'),
('sound', 'Silence is a tool, not a mistake', 'Strategic pauses create emphasis and anticipation.', 'industry')

ON CONFLICT DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_status ON discernment_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON discernment_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vocabulary_term ON user_vocabulary(term);
CREATE INDEX IF NOT EXISTS idx_focus_weight ON focus_areas(importance_weight DESC);
CREATE INDEX IF NOT EXISTS idx_directions_active ON user_directions(active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_viral_category ON viral_knowledge(category);

-- Enable RLS
ALTER TABLE discernment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_directions ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_knowledge ENABLE ROW LEVEL SECURITY;

-- Allow all for now (single user)
CREATE POLICY "Allow all" ON discernment_sessions FOR ALL USING (true);
CREATE POLICY "Allow all" ON conversation_messages FOR ALL USING (true);
CREATE POLICY "Allow all" ON user_vocabulary FOR ALL USING (true);
CREATE POLICY "Allow all" ON focus_areas FOR ALL USING (true);
CREATE POLICY "Allow all" ON video_comparisons FOR ALL USING (true);
CREATE POLICY "Allow all" ON user_directions FOR ALL USING (true);
CREATE POLICY "Allow all" ON viral_knowledge FOR ALL USING (true);

-- Comments
COMMENT ON TABLE discernment_sessions IS 'Each conversation about a video. Stores analysis, dialogue, and final synthesis.';
COMMENT ON TABLE conversation_messages IS 'Individual messages in the discernment dialogue.';
COMMENT ON TABLE user_vocabulary IS 'Terms the user has defined - their personal language for content analysis.';
COMMENT ON TABLE focus_areas IS 'What the user cares about - evolves based on their observations.';
COMMENT ON TABLE video_comparisons IS 'When user compares videos, capturing their reasoning.';
COMMENT ON TABLE user_directions IS 'Explicit rules and preferences the user has stated.';
COMMENT ON TABLE viral_knowledge IS 'General principles about viral content - baseline knowledge.';
