-- ============================================================================
-- H1 MODEL TRAINING TABLES
-- Training data collection and model tracking for H1 relational models
-- Part of the DPO (Direct Preference Optimization) training pipeline
-- ============================================================================

-- ============================================================================
-- TABLE 1: H1 TRAINING PAIRS
-- Annotated clip pairs for DPO training
-- ============================================================================

CREATE TABLE IF NOT EXISTS h1_training_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- H1 model type this trains
  h1_type TEXT NOT NULL CHECK (h1_type IN (
    'quality_ranking',      -- Which content is better overall?
    'humor_similarity',     -- How similar in humor style?
    'replicability_similarity',  -- How similar to produce?
    'audience_fit'          -- Would same audience enjoy both?
  )),

  -- Clip references
  clip_a_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,
  clip_b_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,

  -- Human annotation
  human_note TEXT NOT NULL,  -- Natural language note about the comparison

  -- Judgment (for DPO chosen/rejected)
  winner TEXT NOT NULL CHECK (winner IN ('clip_a', 'clip_b', 'tie')),
  winner_reasoning TEXT,     -- For the "chosen" response in DPO
  loser_reasoning TEXT,      -- For the "rejected" response in DPO

  -- For similarity H1s (not ranking)
  similarity_score FLOAT CHECK (similarity_score >= 0 AND similarity_score <= 1),

  -- Confidence and quality
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  annotation_quality TEXT DEFAULT 'draft' CHECK (annotation_quality IN ('draft', 'silver', 'gold')),

  -- Authorship
  annotated_by UUID REFERENCES profiles(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT h1_pairs_no_self CHECK (clip_a_id != clip_b_id),
  CONSTRAINT h1_pairs_unique UNIQUE (h1_type, clip_a_id, clip_b_id)
);

-- Indexes for h1_training_pairs
CREATE INDEX IF NOT EXISTS idx_h1_pairs_type ON h1_training_pairs(h1_type);
CREATE INDEX IF NOT EXISTS idx_h1_pairs_clip_a ON h1_training_pairs(clip_a_id);
CREATE INDEX IF NOT EXISTS idx_h1_pairs_clip_b ON h1_training_pairs(clip_b_id);
CREATE INDEX IF NOT EXISTS idx_h1_pairs_quality ON h1_training_pairs(annotation_quality);
CREATE INDEX IF NOT EXISTS idx_h1_pairs_created ON h1_training_pairs(created_at DESC);

-- ============================================================================
-- TABLE 2: H1 MODELS
-- Trained H1 model versions
-- ============================================================================

CREATE TABLE IF NOT EXISTS h1_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Model identification
  h1_type TEXT NOT NULL CHECK (h1_type IN (
    'quality_ranking', 'humor_similarity', 'replicability_similarity', 'audience_fit'
  )),
  version_name TEXT NOT NULL,  -- e.g., 'quality_ranking_v1'

  -- Training details
  training_pairs_count INT,
  base_model TEXT DEFAULT 'gemini-2.5-flash',
  training_method TEXT DEFAULT 'dpo' CHECK (training_method IN ('sft', 'dpo', 'sft_then_dpo')),

  -- Vertex AI tracking
  vertex_job_id TEXT,
  gemini_model_id TEXT,  -- The actual tuned model endpoint

  -- Training data URIs
  training_data_uri TEXT,     -- gs://...
  validation_data_uri TEXT,   -- gs://...

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'training', 'ready', 'active', 'retired', 'failed'
  )),
  is_active BOOLEAN DEFAULT false,

  -- Evaluation
  eval_accuracy FLOAT,
  eval_notes TEXT,

  -- Timestamps
  training_started_at TIMESTAMPTZ,
  training_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only one active model per H1 type
  CONSTRAINT h1_models_unique_version UNIQUE (h1_type, version_name)
);

-- Index for active model lookup
CREATE INDEX IF NOT EXISTS idx_h1_models_active ON h1_models(h1_type, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_h1_models_status ON h1_models(status);

-- ============================================================================
-- TABLE 3: H1 RELATIONAL MATRICES
-- Output of H1 models - predicted relationships between all clips
-- ============================================================================

CREATE TABLE IF NOT EXISTS h1_relational_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which model produced this
  h1_model_id UUID NOT NULL REFERENCES h1_models(id) ON DELETE CASCADE,

  -- Clip pair (always clip_a < clip_b for consistency)
  clip_a_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,
  clip_b_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,

  -- Predicted values
  score FLOAT NOT NULL CHECK (score >= 0 AND score <= 1),
  winner TEXT CHECK (winner IN ('clip_a', 'clip_b', 'tie')),  -- For ranking H1s
  reasoning TEXT,
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT h1_matrix_no_self CHECK (clip_a_id != clip_b_id),
  CONSTRAINT h1_matrix_unique UNIQUE (h1_model_id, clip_a_id, clip_b_id)
);

-- Indexes for matrix queries
CREATE INDEX IF NOT EXISTS idx_h1_matrix_model ON h1_relational_matrices(h1_model_id);
CREATE INDEX IF NOT EXISTS idx_h1_matrix_clip_a ON h1_relational_matrices(clip_a_id);
CREATE INDEX IF NOT EXISTS idx_h1_matrix_clip_b ON h1_relational_matrices(clip_b_id);
CREATE INDEX IF NOT EXISTS idx_h1_matrix_score ON h1_relational_matrices(score DESC);

-- ============================================================================
-- TABLE 4: H1 QUALITY RANKINGS
-- Computed global hierarchy from pairwise quality comparisons
-- ============================================================================

CREATE TABLE IF NOT EXISTS h1_quality_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which model produced this
  h1_model_id UUID NOT NULL REFERENCES h1_models(id) ON DELETE CASCADE,

  -- Clip and rank
  clip_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,
  rank_position INT NOT NULL,  -- 1 = best
  quality_score FLOAT NOT NULL CHECK (quality_score >= 0 AND quality_score <= 1),

  -- Stats from pairwise comparisons
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  ties INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT h1_ranking_unique UNIQUE (h1_model_id, clip_id)
);

-- Index for ranking queries
CREATE INDEX IF NOT EXISTS idx_h1_rankings_model ON h1_quality_rankings(h1_model_id);
CREATE INDEX IF NOT EXISTS idx_h1_rankings_rank ON h1_quality_rankings(h1_model_id, rank_position ASC);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_h1_training_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS h1_training_pairs_updated_at ON h1_training_pairs;
CREATE TRIGGER h1_training_pairs_updated_at
  BEFORE UPDATE ON h1_training_pairs
  FOR EACH ROW
  EXECUTE FUNCTION update_h1_training_timestamp();

-- ============================================================================
-- UPSERT FUNCTIONS
-- ============================================================================

-- Upsert training pair with consistent ordering
CREATE OR REPLACE FUNCTION upsert_h1_training_pair(
  p_h1_type TEXT,
  p_clip_a_id UUID,
  p_clip_b_id UUID,
  p_human_note TEXT,
  p_winner TEXT,
  p_winner_reasoning TEXT DEFAULT NULL,
  p_loser_reasoning TEXT DEFAULT NULL,
  p_similarity_score FLOAT DEFAULT NULL,
  p_confidence FLOAT DEFAULT 0.7,
  p_annotation_quality TEXT DEFAULT 'draft'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_ordered_a UUID;
  v_ordered_b UUID;
  v_actual_winner TEXT;
BEGIN
  -- Ensure consistent ordering (a < b)
  IF p_clip_a_id < p_clip_b_id THEN
    v_ordered_a := p_clip_a_id;
    v_ordered_b := p_clip_b_id;
    v_actual_winner := p_winner;
  ELSE
    v_ordered_a := p_clip_b_id;
    v_ordered_b := p_clip_a_id;
    -- Flip winner if clips were reordered
    v_actual_winner := CASE p_winner
      WHEN 'clip_a' THEN 'clip_b'
      WHEN 'clip_b' THEN 'clip_a'
      ELSE 'tie'
    END;
  END IF;

  INSERT INTO h1_training_pairs (
    h1_type, clip_a_id, clip_b_id, human_note, winner,
    winner_reasoning, loser_reasoning, similarity_score,
    confidence, annotation_quality
  )
  VALUES (
    p_h1_type, v_ordered_a, v_ordered_b, p_human_note, v_actual_winner,
    p_winner_reasoning, p_loser_reasoning, p_similarity_score,
    p_confidence, p_annotation_quality
  )
  ON CONFLICT (h1_type, clip_a_id, clip_b_id) DO UPDATE SET
    human_note = EXCLUDED.human_note,
    winner = EXCLUDED.winner,
    winner_reasoning = EXCLUDED.winner_reasoning,
    loser_reasoning = EXCLUDED.loser_reasoning,
    similarity_score = EXCLUDED.similarity_score,
    confidence = EXCLUDED.confidence,
    annotation_quality = EXCLUDED.annotation_quality,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Get training stats per H1 type
CREATE OR REPLACE FUNCTION get_h1_training_stats()
RETURNS TABLE (
  h1_type TEXT,
  total_pairs INT,
  gold_pairs INT,
  silver_pairs INT,
  draft_pairs INT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    htp.h1_type,
    COUNT(*)::INT as total_pairs,
    COUNT(*) FILTER (WHERE htp.annotation_quality = 'gold')::INT as gold_pairs,
    COUNT(*) FILTER (WHERE htp.annotation_quality = 'silver')::INT as silver_pairs,
    COUNT(*) FILTER (WHERE htp.annotation_quality = 'draft')::INT as draft_pairs
  FROM h1_training_pairs htp
  GROUP BY htp.h1_type
  ORDER BY htp.h1_type;
END;
$$;

-- Get random unannotated pair for H1 type
CREATE OR REPLACE FUNCTION get_random_clip_pair_for_h1(
  p_h1_type TEXT,
  p_exclude_annotated BOOLEAN DEFAULT true
)
RETURNS TABLE (
  clip_a_id UUID,
  clip_a_video_id TEXT,
  clip_b_id UUID,
  clip_b_video_id TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH clip_pool AS (
    SELECT av.id, av.video_id
    FROM analyzed_videos av
    WHERE av.visual_analysis IS NOT NULL
    ORDER BY RANDOM()
    LIMIT 100
  ),
  all_pairs AS (
    SELECT
      a.id as a_id, a.video_id as a_vid,
      b.id as b_id, b.video_id as b_vid
    FROM clip_pool a
    CROSS JOIN clip_pool b
    WHERE a.id < b.id
  )
  SELECT
    ap.a_id, ap.a_vid,
    ap.b_id, ap.b_vid
  FROM all_pairs ap
  WHERE (NOT p_exclude_annotated OR NOT EXISTS (
    SELECT 1 FROM h1_training_pairs htp
    WHERE htp.h1_type = p_h1_type
    AND htp.clip_a_id = ap.a_id
    AND htp.clip_b_id = ap.b_id
  ))
  ORDER BY RANDOM()
  LIMIT 1;
END;
$$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE h1_training_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE h1_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE h1_relational_matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE h1_quality_rankings ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access h1_training_pairs"
  ON h1_training_pairs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access h1_models"
  ON h1_models FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access h1_relational_matrices"
  ON h1_relational_matrices FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access h1_quality_rankings"
  ON h1_quality_rankings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated users can read
CREATE POLICY "Authenticated read h1_training_pairs"
  ON h1_training_pairs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated read h1_models"
  ON h1_models FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated read h1_relational_matrices"
  ON h1_relational_matrices FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated read h1_quality_rankings"
  ON h1_quality_rankings FOR SELECT
  USING (auth.role() = 'authenticated');

-- Anon read for public API
CREATE POLICY "Anon read h1_relational_matrices"
  ON h1_relational_matrices FOR SELECT USING (true);

CREATE POLICY "Anon read h1_quality_rankings"
  ON h1_quality_rankings FOR SELECT USING (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE h1_training_pairs IS
'Annotated clip pairs for H1 model training via DPO. Human notes + winner/loser judgments.';

COMMENT ON TABLE h1_models IS
'Trained H1 model versions with Vertex AI job tracking.';

COMMENT ON TABLE h1_relational_matrices IS
'Output of H1 models - predicted relationships for all clip pairs.';

COMMENT ON TABLE h1_quality_rankings IS
'Computed global quality hierarchy from pairwise quality comparisons.';

COMMENT ON FUNCTION upsert_h1_training_pair IS
'Creates or updates a training pair with consistent clip ordering.';

COMMENT ON FUNCTION get_h1_training_stats IS
'Returns training data statistics per H1 type.';

COMMENT ON FUNCTION get_random_clip_pair_for_h1 IS
'Returns a random unannotated clip pair for annotation.';
