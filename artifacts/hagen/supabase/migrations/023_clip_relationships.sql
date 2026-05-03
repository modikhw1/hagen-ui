-- ============================================================================
-- CLIP RELATIONSHIPS TABLES
-- Multi-dimensional relationship tracking between video clips
-- Part of the Relational Matrix system
-- ============================================================================

-- ============================================================================
-- TABLE 1: RELATIONSHIP NOTES (Static anchors - user-written)
-- These notes anchor relationships and never auto-modify
-- ============================================================================

CREATE TABLE IF NOT EXISTS relationship_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Clip references (clip_b can be NULL for single-clip observations)
  clip_a_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,
  clip_b_id UUID REFERENCES analyzed_videos(id) ON DELETE CASCADE,

  -- Note content
  note_type TEXT NOT NULL CHECK (note_type IN ('connection', 'disconnection', 'observation')),
  note_text TEXT NOT NULL,

  -- Which dimensions this note affects
  affects_dimensions TEXT[] DEFAULT '{}',

  -- Authorship
  created_by UUID REFERENCES profiles(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for relationship_notes
CREATE INDEX IF NOT EXISTS idx_rel_notes_clip_a ON relationship_notes(clip_a_id);
CREATE INDEX IF NOT EXISTS idx_rel_notes_clip_b ON relationship_notes(clip_b_id);
CREATE INDEX IF NOT EXISTS idx_rel_notes_type ON relationship_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_rel_notes_dimensions ON relationship_notes USING GIN(affects_dimensions);

-- ============================================================================
-- TABLE 2: CLIP RELATIONSHIPS (Parent relationship with composite score)
-- Updated by LLM inference, versioned per batch
-- ============================================================================

CREATE TABLE IF NOT EXISTS clip_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Clip pair (always clip_a < clip_b alphabetically for consistency)
  clip_a_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,
  clip_b_id UUID NOT NULL REFERENCES analyzed_videos(id) ON DELETE CASCADE,

  -- Composite score (weighted average of dimensions)
  composite_strength FLOAT CHECK (composite_strength >= 0 AND composite_strength <= 1),
  overall_reasoning TEXT,

  -- Versioning for batch updates
  batch_inferred_at TIMESTAMPTZ DEFAULT NOW(),
  clip_count_at_inference INTEGER,
  inference_model TEXT DEFAULT 'claude-sonnet-4',

  -- Human feedback on overall relationship
  human_feedback TEXT,
  human_feedback_by UUID REFERENCES profiles(id),
  human_feedback_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique pairs (no duplicate A-B relationships)
  CONSTRAINT clip_relationships_unique_pair UNIQUE(clip_a_id, clip_b_id),
  -- Prevent self-relationships
  CONSTRAINT clip_relationships_no_self CHECK (clip_a_id != clip_b_id)
);

-- Indexes for clip_relationships
CREATE INDEX IF NOT EXISTS idx_clip_rel_a ON clip_relationships(clip_a_id);
CREATE INDEX IF NOT EXISTS idx_clip_rel_b ON clip_relationships(clip_b_id);
CREATE INDEX IF NOT EXISTS idx_clip_rel_strength ON clip_relationships(composite_strength DESC);
CREATE INDEX IF NOT EXISTS idx_clip_rel_batch ON clip_relationships(batch_inferred_at DESC);

-- ============================================================================
-- TABLE 3: CLIP RELATIONSHIP DIMENSIONS (Per-dimension scores)
-- Multi-dimensional breakdown of each relationship
-- ============================================================================

CREATE TABLE IF NOT EXISTS clip_relationship_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to parent relationship
  relationship_id UUID NOT NULL REFERENCES clip_relationships(id) ON DELETE CASCADE,

  -- Dimension identification
  dimension TEXT NOT NULL CHECK (dimension IN (
    'humor_mechanism', 'replicability', 'audience', 'format'
  )),

  -- Scores and reasoning
  strength FLOAT CHECK (strength >= 0 AND strength <= 1),
  reasoning TEXT,

  -- Note anchoring (references to relationship_notes.id that informed this score)
  anchored_by_notes UUID[] DEFAULT '{}',

  -- Confidence tracking
  confidence_score FLOAT DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One dimension per relationship
  CONSTRAINT rel_dim_unique UNIQUE(relationship_id, dimension)
);

-- Indexes for clip_relationship_dimensions
CREATE INDEX IF NOT EXISTS idx_rel_dim_relationship ON clip_relationship_dimensions(relationship_id);
CREATE INDEX IF NOT EXISTS idx_rel_dim_dimension ON clip_relationship_dimensions(dimension);
CREATE INDEX IF NOT EXISTS idx_rel_dim_strength ON clip_relationship_dimensions(strength DESC);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_relationship_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS clip_relationships_updated_at ON clip_relationships;
CREATE TRIGGER clip_relationships_updated_at
  BEFORE UPDATE ON clip_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_relationship_timestamp();

DROP TRIGGER IF EXISTS rel_dimensions_updated_at ON clip_relationship_dimensions;
CREATE TRIGGER rel_dimensions_updated_at
  BEFORE UPDATE ON clip_relationship_dimensions
  FOR EACH ROW
  EXECUTE FUNCTION update_relationship_timestamp();

DROP TRIGGER IF EXISTS rel_notes_updated_at ON relationship_notes;
CREATE TRIGGER rel_notes_updated_at
  BEFORE UPDATE ON relationship_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_relationship_timestamp();

-- ============================================================================
-- UPSERT FUNCTIONS
-- ============================================================================

-- Upsert a clip relationship (ensures clip_a < clip_b ordering)
CREATE OR REPLACE FUNCTION upsert_clip_relationship(
  p_clip_a_id UUID,
  p_clip_b_id UUID,
  p_composite_strength FLOAT,
  p_overall_reasoning TEXT,
  p_clip_count INTEGER DEFAULT NULL,
  p_inference_model TEXT DEFAULT 'claude-sonnet-4'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_ordered_a UUID;
  v_ordered_b UUID;
BEGIN
  -- Ensure consistent ordering (a < b alphabetically)
  IF p_clip_a_id < p_clip_b_id THEN
    v_ordered_a := p_clip_a_id;
    v_ordered_b := p_clip_b_id;
  ELSE
    v_ordered_a := p_clip_b_id;
    v_ordered_b := p_clip_a_id;
  END IF;

  INSERT INTO clip_relationships (
    clip_a_id, clip_b_id, composite_strength, overall_reasoning,
    batch_inferred_at, clip_count_at_inference, inference_model
  )
  VALUES (
    v_ordered_a, v_ordered_b, p_composite_strength, p_overall_reasoning,
    NOW(), p_clip_count, p_inference_model
  )
  ON CONFLICT (clip_a_id, clip_b_id) DO UPDATE SET
    composite_strength = EXCLUDED.composite_strength,
    overall_reasoning = EXCLUDED.overall_reasoning,
    batch_inferred_at = NOW(),
    clip_count_at_inference = EXCLUDED.clip_count_at_inference,
    inference_model = EXCLUDED.inference_model
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Upsert a dimension score for a relationship
CREATE OR REPLACE FUNCTION upsert_relationship_dimension(
  p_relationship_id UUID,
  p_dimension TEXT,
  p_strength FLOAT,
  p_reasoning TEXT,
  p_anchored_by_notes UUID[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO clip_relationship_dimensions (
    relationship_id, dimension, strength, reasoning, anchored_by_notes
  )
  VALUES (
    p_relationship_id, p_dimension, p_strength, p_reasoning, p_anchored_by_notes
  )
  ON CONFLICT (relationship_id, dimension) DO UPDATE SET
    strength = EXCLUDED.strength,
    reasoning = EXCLUDED.reasoning,
    anchored_by_notes = EXCLUDED.anchored_by_notes,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================================
-- QUERY FUNCTIONS
-- ============================================================================

-- Get all relationships for a clip with dimension details
CREATE OR REPLACE FUNCTION get_clip_relationships(
  p_clip_id UUID,
  p_min_strength FLOAT DEFAULT 0.3,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  relationship_id UUID,
  related_clip_id UUID,
  composite_strength FLOAT,
  overall_reasoning TEXT,
  dimensions JSONB,
  batch_inferred_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH relationships AS (
    SELECT
      cr.id,
      CASE
        WHEN cr.clip_a_id = p_clip_id THEN cr.clip_b_id
        ELSE cr.clip_a_id
      END as other_clip,
      cr.composite_strength,
      cr.overall_reasoning,
      cr.batch_inferred_at
    FROM clip_relationships cr
    WHERE (cr.clip_a_id = p_clip_id OR cr.clip_b_id = p_clip_id)
      AND cr.composite_strength >= p_min_strength
  )
  SELECT
    r.id as relationship_id,
    r.other_clip as related_clip_id,
    r.composite_strength,
    r.overall_reasoning,
    COALESCE(
      jsonb_object_agg(
        crd.dimension,
        jsonb_build_object(
          'strength', crd.strength,
          'reasoning', crd.reasoning,
          'anchored_by_notes', crd.anchored_by_notes
        )
      ) FILTER (WHERE crd.dimension IS NOT NULL),
      '{}'::jsonb
    ) as dimensions,
    r.batch_inferred_at
  FROM relationships r
  LEFT JOIN clip_relationship_dimensions crd ON crd.relationship_id = r.id
  GROUP BY r.id, r.other_clip, r.composite_strength, r.overall_reasoning, r.batch_inferred_at
  ORDER BY r.composite_strength DESC
  LIMIT p_limit;
END;
$$;

-- Get relationship notes between two clips
CREATE OR REPLACE FUNCTION get_relationship_notes(
  p_clip_a_id UUID,
  p_clip_b_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  note_type TEXT,
  note_text TEXT,
  affects_dimensions TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_clip_b_id IS NULL THEN
    -- Get all notes for clip_a
    RETURN QUERY
    SELECT rn.id, rn.note_type, rn.note_text, rn.affects_dimensions, rn.created_at
    FROM relationship_notes rn
    WHERE rn.clip_a_id = p_clip_a_id OR rn.clip_b_id = p_clip_a_id
    ORDER BY rn.created_at DESC;
  ELSE
    -- Get notes between two specific clips
    RETURN QUERY
    SELECT rn.id, rn.note_type, rn.note_text, rn.affects_dimensions, rn.created_at
    FROM relationship_notes rn
    WHERE (rn.clip_a_id = p_clip_a_id AND rn.clip_b_id = p_clip_b_id)
       OR (rn.clip_a_id = p_clip_b_id AND rn.clip_b_id = p_clip_a_id)
       OR (rn.clip_a_id = p_clip_a_id AND rn.clip_b_id IS NULL)
       OR (rn.clip_a_id = p_clip_b_id AND rn.clip_b_id IS NULL)
    ORDER BY rn.created_at DESC;
  END IF;
END;
$$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE relationship_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clip_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE clip_relationship_dimensions ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role has full access to relationship_notes"
  ON relationship_notes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to clip_relationships"
  ON clip_relationships FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to clip_relationship_dimensions"
  ON clip_relationship_dimensions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated users can read all
CREATE POLICY "Authenticated users can read relationship_notes"
  ON relationship_notes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read clip_relationships"
  ON clip_relationships FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read clip_relationship_dimensions"
  ON clip_relationship_dimensions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Anon can read (for public API)
CREATE POLICY "Anon can read relationship_notes"
  ON relationship_notes FOR SELECT USING (true);

CREATE POLICY "Anon can read clip_relationships"
  ON clip_relationships FOR SELECT USING (true);

CREATE POLICY "Anon can read clip_relationship_dimensions"
  ON clip_relationship_dimensions FOR SELECT USING (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE relationship_notes IS
'User-written notes that anchor clip relationships. These are static and never auto-modified by the system.';

COMMENT ON TABLE clip_relationships IS
'Multi-dimensional relationships between video clips. Updated by LLM inference in batches.';

COMMENT ON TABLE clip_relationship_dimensions IS
'Per-dimension scores for each clip relationship (humor_mechanism, replicability, audience, format).';

COMMENT ON FUNCTION upsert_clip_relationship IS
'Creates or updates a clip relationship with consistent clip ordering (a < b).';

COMMENT ON FUNCTION get_clip_relationships IS
'Returns all relationships for a clip with dimension breakdown.';
