-- =====================================================
-- Migration 007: Concepts Architecture
-- =====================================================
-- Purpose: Move concept data from JSON files to Supabase
-- Creates: concepts, customer_concepts, concept_versions tables
-- =====================================================

-- Master concept library (replaces clips-priority.json)
CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('hagen', 'cm_created')),
  created_by UUID REFERENCES profiles(id),
  backend_data JSONB NOT NULL, -- Full clip data from hagen analysis
  overrides JSONB DEFAULT '{}'::jsonb, -- Swedish translations & custom overrides
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  previous_version JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_concepts_source ON concepts(source);
CREATE INDEX IF NOT EXISTS idx_concepts_active ON concepts(is_active);
CREATE INDEX IF NOT EXISTS idx_concepts_created_by ON concepts(created_by);
CREATE INDEX IF NOT EXISTS idx_concepts_created_at ON concepts(created_at DESC);

-- Customer-specific concept customizations
-- Replaces customer_profiles.concepts JSONB array
CREATE TABLE IF NOT EXISTS customer_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_profile_id UUID REFERENCES customer_profiles(id) ON DELETE CASCADE NOT NULL,
  concept_id TEXT REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,

  -- Custom fields (override base concept)
  custom_headline TEXT,
  custom_description TEXT,
  custom_why_it_works TEXT,
  custom_instructions TEXT,
  custom_target_audience TEXT,
  custom_script TEXT,
  custom_production_notes TEXT[],

  -- Metadata
  match_percentage INTEGER DEFAULT 85 CHECK (match_percentage BETWEEN 0 AND 100),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  notes TEXT, -- CM notes about this concept for this customer
  added_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  base_concept_version INTEGER DEFAULT 1,

  -- Ensure each customer can only have one instance of a concept
  UNIQUE(customer_profile_id, concept_id)
);

-- Indexes for customer_concepts
CREATE INDEX IF NOT EXISTS idx_customer_concepts_customer ON customer_concepts(customer_profile_id);
CREATE INDEX IF NOT EXISTS idx_customer_concepts_concept ON customer_concepts(concept_id);
CREATE INDEX IF NOT EXISTS idx_customer_concepts_status ON customer_concepts(status);
CREATE INDEX IF NOT EXISTS idx_customer_concepts_added_at ON customer_concepts(added_at DESC);

-- Version history for concepts (audit trail)
CREATE TABLE IF NOT EXISTS concept_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id TEXT REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
  version INTEGER NOT NULL,
  backend_data JSONB NOT NULL,
  overrides JSONB NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  change_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(concept_id, version)
);

-- Index for version history
CREATE INDEX IF NOT EXISTS idx_concept_versions_concept ON concept_versions(concept_id);
CREATE INDEX IF NOT EXISTS idx_concept_versions_created_at ON concept_versions(created_at DESC);

-- =====================================================
-- RLS Policies for concepts
-- =====================================================

-- Enable RLS
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_versions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe to run multiple times)
DROP POLICY IF EXISTS "Admins and CMs can view all concepts" ON concepts;
DROP POLICY IF EXISTS "Admins can manage concepts" ON concepts;
DROP POLICY IF EXISTS "Customers can view their concepts" ON customer_concepts;
DROP POLICY IF EXISTS "Admins and CMs can view all customer_concepts" ON customer_concepts;
DROP POLICY IF EXISTS "Admins and CMs can manage customer_concepts" ON customer_concepts;
DROP POLICY IF EXISTS "Admins and CMs can view concept_versions" ON concept_versions;
DROP POLICY IF EXISTS "Admins can create concept_versions" ON concept_versions;

-- Concepts: Admins and CMs can view all
CREATE POLICY "Admins and CMs can view all concepts"
  ON concepts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role IN ('admin', 'content_manager'))
    )
  );

-- Concepts: Only admins can insert/update/delete
CREATE POLICY "Admins can manage concepts"
  ON concepts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'admin')
    )
  );

-- Customer_concepts: Customers can view their own
CREATE POLICY "Customers can view their concepts"
  ON customer_concepts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.matching_data->>'customer_profile_id' = customer_profile_id::text
    )
  );

-- Customer_concepts: Admins and CMs can view all
CREATE POLICY "Admins and CMs can view all customer_concepts"
  ON customer_concepts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role IN ('admin', 'content_manager'))
    )
  );

-- Customer_concepts: Admins and CMs can insert/update/delete
CREATE POLICY "Admins and CMs can manage customer_concepts"
  ON customer_concepts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role IN ('admin', 'content_manager'))
    )
  );

-- Concept_versions: Admins and CMs can view
CREATE POLICY "Admins and CMs can view concept_versions"
  ON concept_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role IN ('admin', 'content_manager'))
    )
  );

-- Concept_versions: Only admins can insert
CREATE POLICY "Admins can create concept_versions"
  ON concept_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'admin')
    )
  );

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to update concept and create version history
CREATE OR REPLACE FUNCTION update_concept_with_version(
  p_concept_id TEXT,
  p_backend_data JSONB,
  p_overrides JSONB,
  p_changed_by UUID,
  p_change_summary TEXT
) RETURNS JSONB AS $$
DECLARE
  v_current_version INTEGER;
  v_new_version INTEGER;
  v_result JSONB;
BEGIN
  -- Get current version
  SELECT version INTO v_current_version
  FROM concepts
  WHERE id = p_concept_id;

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'Concept not found: %', p_concept_id;
  END IF;

  -- Calculate new version
  v_new_version := v_current_version + 1;

  -- Save current state to version history
  INSERT INTO concept_versions (
    concept_id,
    version,
    backend_data,
    overrides,
    changed_by,
    change_summary
  )
  SELECT
    id,
    version,
    backend_data,
    overrides,
    p_changed_by,
    p_change_summary
  FROM concepts
  WHERE id = p_concept_id;

  -- Update concept
  UPDATE concepts
  SET
    backend_data = p_backend_data,
    overrides = p_overrides,
    version = v_new_version,
    updated_at = NOW()
  WHERE id = p_concept_id
  RETURNING to_jsonb(concepts.*) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get concept with customer customizations
CREATE OR REPLACE FUNCTION get_customer_concept(
  p_customer_profile_id UUID,
  p_concept_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'concept', to_jsonb(c.*),
    'customization', to_jsonb(cc.*)
  ) INTO v_result
  FROM concepts c
  LEFT JOIN customer_concepts cc
    ON cc.concept_id = c.id
    AND cc.customer_profile_id = p_customer_profile_id
  WHERE c.id = p_concept_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Comments for documentation
-- =====================================================

COMMENT ON TABLE concepts IS 'Master library of TikTok concepts from hagen analysis and CM-created content';
COMMENT ON TABLE customer_concepts IS 'Customer-specific concept customizations and assignments';
COMMENT ON TABLE concept_versions IS 'Version history and audit trail for concept changes';

COMMENT ON COLUMN concepts.backend_data IS 'Full clip data from hagen video analysis (humor_analysis, replicability_signals, scene_breakdown, etc)';
COMMENT ON COLUMN concepts.overrides IS 'Swedish translations and custom overrides (headline_sv, description_sv, etc)';
COMMENT ON COLUMN concepts.source IS 'Origin: hagen (from backend analysis) or cm_created (created by content manager)';

COMMENT ON COLUMN customer_concepts.custom_headline IS 'Customer-specific headline override';
COMMENT ON COLUMN customer_concepts.match_percentage IS 'How well this concept matches customer brand (0-100)';
COMMENT ON COLUMN customer_concepts.status IS 'Concept status: active, paused, or completed';
