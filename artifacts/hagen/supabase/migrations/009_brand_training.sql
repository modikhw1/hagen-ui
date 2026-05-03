-- Brand Training System
-- Adds training notes and RAG-based learning from past conversations
-- Enables the agent to learn from feedback on 20+ dialogue instances

-- ============================================================================
-- ADD TRAINING NOTES TO EXISTING TABLES
-- ============================================================================

-- Add training_note column to messages for per-message feedback
ALTER TABLE brand_conversation_messages 
ADD COLUMN IF NOT EXISTS training_note TEXT;

-- Add session_notes column to conversations for overall session feedback  
ALTER TABLE brand_conversations
ADD COLUMN IF NOT EXISTS session_notes TEXT;

-- Add training_quality flag to mark conversations suitable for training
ALTER TABLE brand_conversations
ADD COLUMN IF NOT EXISTS training_quality TEXT DEFAULT 'unreviewed' 
CHECK (training_quality IN ('unreviewed', 'good', 'needs_improvement', 'bad', 'excluded'));

-- ============================================================================
-- BRAND TRAINING EXAMPLES
-- Curated examples extracted from conversations for RAG retrieval
-- ============================================================================

CREATE TABLE IF NOT EXISTS brand_training_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source reference
  conversation_id UUID REFERENCES brand_conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES brand_conversation_messages(id) ON DELETE SET NULL,
  
  -- Example type
  example_type TEXT NOT NULL CHECK (example_type IN (
    'good_question',      -- A question that worked well
    'good_response',      -- A response that extracted useful info
    'good_transition',    -- A smooth phase transition
    'insight_extraction', -- Good insight extraction from user message
    'bad_example',        -- What NOT to do (for negative examples)
    'conversation_flow',  -- Full conversation excerpt showing good flow
    'brand_synthesis'     -- Good brand profile synthesis
  )),
  
  -- The actual content
  context TEXT,           -- What came before (for context)
  content TEXT NOT NULL,  -- The example content itself
  outcome TEXT,           -- What came after / the result
  
  -- Why this is a good/bad example
  explanation TEXT,
  
  -- Metadata for retrieval
  tags TEXT[],            -- ['cafe', 'startup', 'casual-tone', etc]
  phase TEXT,             -- Which conversation phase
  business_type TEXT,     -- Type of business this applies to
  
  -- Embedding for RAG retrieval
  embedding vector(1536),
  
  -- Quality and usage tracking
  quality_score FLOAT DEFAULT 0.5,  -- 0-1, higher = better example
  times_used INTEGER DEFAULT 0,      -- How often retrieved
  last_used_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'manual'   -- 'manual', 'auto-extracted', 'imported'
);

-- Indexes for efficient retrieval
CREATE INDEX IF NOT EXISTS idx_training_examples_type ON brand_training_examples(example_type);
CREATE INDEX IF NOT EXISTS idx_training_examples_phase ON brand_training_examples(phase);
CREATE INDEX IF NOT EXISTS idx_training_examples_business ON brand_training_examples(business_type);
CREATE INDEX IF NOT EXISTS idx_training_examples_quality ON brand_training_examples(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_training_examples_embedding ON brand_training_examples 
  USING ivfflat (embedding vector_cosine_ops);

-- ============================================================================
-- BRAND TRAINING PATTERNS
-- Higher-level patterns learned from multiple conversations
-- ============================================================================

CREATE TABLE IF NOT EXISTS brand_training_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Pattern identification
  pattern_name TEXT NOT NULL,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'question_strategy',   -- Effective questioning approaches
    'tone_matching',       -- How to match different brand tones
    'insight_extraction',  -- Patterns for extracting underlying info
    'phase_transition',    -- When/how to transition phases
    'difficult_situation', -- Handling unclear or reluctant users
    'business_specific'    -- Patterns specific to business types
  )),
  
  -- Pattern description
  description TEXT NOT NULL,
  when_to_use TEXT,
  how_to_apply TEXT,
  
  -- Examples that demonstrate this pattern
  example_ids UUID[],
  
  -- Applicability
  applies_to_phases TEXT[],
  applies_to_business_types TEXT[],
  
  -- Embedding for semantic matching
  embedding vector(1536),
  
  -- Tracking
  effectiveness_score FLOAT DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_patterns_type ON brand_training_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_training_patterns_embedding ON brand_training_patterns 
  USING ivfflat (embedding vector_cosine_ops);

-- ============================================================================
-- FUNCTIONS FOR RAG RETRIEVAL
-- ============================================================================

-- Find relevant training examples for a given context
CREATE OR REPLACE FUNCTION find_training_examples(
  query_embedding vector(1536),
  example_types TEXT[] DEFAULT NULL,
  target_phase TEXT DEFAULT NULL,
  target_business_type TEXT DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.6,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  example_type TEXT,
  context TEXT,
  content TEXT,
  outcome TEXT,
  explanation TEXT,
  tags TEXT[],
  phase TEXT,
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
    e.context,
    e.content,
    e.outcome,
    e.explanation,
    e.tags,
    e.phase,
    e.quality_score,
    1 - (e.embedding <=> query_embedding) as similarity
  FROM brand_training_examples e
  WHERE e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
    AND (example_types IS NULL OR e.example_type = ANY(example_types))
    AND (target_phase IS NULL OR e.phase = target_phase OR e.phase IS NULL)
    AND (target_business_type IS NULL OR e.business_type = target_business_type OR e.business_type IS NULL)
  ORDER BY 
    e.quality_score DESC,
    e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Find relevant patterns for a situation
CREATE OR REPLACE FUNCTION find_training_patterns(
  query_embedding vector(1536),
  pattern_types TEXT[] DEFAULT NULL,
  target_phase TEXT DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.6,
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  pattern_name TEXT,
  pattern_type TEXT,
  description TEXT,
  when_to_use TEXT,
  how_to_apply TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.pattern_name,
    p.pattern_type,
    p.description,
    p.when_to_use,
    p.how_to_apply,
    1 - (p.embedding <=> query_embedding) as similarity
  FROM brand_training_patterns p
  WHERE p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
    AND (pattern_types IS NULL OR p.pattern_type = ANY(pattern_types))
    AND (target_phase IS NULL OR target_phase = ANY(p.applies_to_phases) OR p.applies_to_phases IS NULL)
  ORDER BY 
    p.effectiveness_score DESC,
    p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Update example usage stats
CREATE OR REPLACE FUNCTION record_example_usage(example_uuid UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE brand_training_examples
  SET 
    times_used = times_used + 1,
    last_used_at = NOW()
  WHERE id = example_uuid;
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update pattern timestamp on changes
CREATE TRIGGER brand_training_patterns_updated_at
  BEFORE UPDATE ON brand_training_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_brand_profile_timestamp();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE brand_training_examples IS 'Curated examples from conversations for RAG-based learning';
COMMENT ON TABLE brand_training_patterns IS 'Higher-level patterns learned from multiple conversation examples';
COMMENT ON COLUMN brand_conversation_messages.training_note IS 'Human feedback on this specific message for training';
COMMENT ON COLUMN brand_conversations.session_notes IS 'Overall human feedback on the conversation session';
COMMENT ON COLUMN brand_conversations.training_quality IS 'Quality rating for using this conversation in training';
