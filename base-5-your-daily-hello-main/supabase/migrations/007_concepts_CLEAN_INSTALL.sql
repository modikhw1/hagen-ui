-- =====================================================
-- Migration 007: Concepts Architecture - CLEAN INSTALL
-- =====================================================
-- This version drops everything and recreates from scratch
-- Use this if you want to start fresh or if incremental migration fails
-- WARNING: This will delete all concept data if it exists!
-- =====================================================

-- Drop everything first (CASCADE will drop dependent objects)
DROP TABLE IF EXISTS concept_versions CASCADE;
DROP TABLE IF EXISTS customer_concepts CASCADE;
DROP TABLE IF EXISTS concepts CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_concept_with_version;
DROP FUNCTION IF EXISTS get_customer_concept;

-- =====================================================
-- Now create everything fresh
-- =====================================================

-- Master concept library
CREATE TABLE concepts (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('hagen', 'cm_created')),
  created_by UUID REFERENCES profiles(id),
  backend_data JSONB NOT NULL,
  overrides JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  previous_version JSONB
);

-- Indexes
CREATE INDEX idx_concepts_source ON concepts(source);
CREATE INDEX idx_concepts_active ON concepts(is_active);
CREATE INDEX idx_concepts_created_by ON concepts(created_by);
CREATE INDEX idx_concepts_created_at ON concepts(created_at DESC);

-- Customer-specific customizations
CREATE TABLE customer_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_profile_id UUID REFERENCES customer_profiles(id) ON DELETE CASCADE NOT NULL,
  concept_id TEXT REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
  custom_headline TEXT,
  custom_description TEXT,
  custom_why_it_works TEXT,
  custom_instructions TEXT,
  custom_target_audience TEXT,
  custom_script TEXT,
  custom_production_notes TEXT[],
  match_percentage INTEGER DEFAULT 85 CHECK (match_percentage BETWEEN 0 AND 100),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  base_concept_version INTEGER DEFAULT 1,
  UNIQUE(customer_profile_id, concept_id)
);

-- Indexes
CREATE INDEX idx_customer_concepts_customer ON customer_concepts(customer_profile_id);
CREATE INDEX idx_customer_concepts_concept ON customer_concepts(concept_id);
CREATE INDEX idx_customer_concepts_status ON customer_concepts(status);
CREATE INDEX idx_customer_concepts_added_at ON customer_concepts(added_at DESC);

-- Version history
CREATE TABLE concept_versions (
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

-- Indexes
CREATE INDEX idx_concept_versions_concept ON concept_versions(concept_id);
CREATE INDEX idx_concept_versions_created_at ON concept_versions(created_at DESC);

-- =====================================================
-- RLS Policies
-- =====================================================

-- Enable RLS
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_versions ENABLE ROW LEVEL SECURITY;

-- Concepts policies
CREATE POLICY "Admins and CMs can view all concepts"
  ON concepts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role IN ('admin', 'content_manager'))
    )
  );

CREATE POLICY "Admins can manage concepts"
  ON concepts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'admin')
    )
  );

-- Customer_concepts policies
CREATE POLICY "Customers can view their concepts"
  ON customer_concepts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.matching_data->>'customer_profile_id' = customer_profile_id::text
    )
  );

CREATE POLICY "Admins and CMs can view all customer_concepts"
  ON customer_concepts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role IN ('admin', 'content_manager'))
    )
  );

CREATE POLICY "Admins and CMs can manage customer_concepts"
  ON customer_concepts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role IN ('admin', 'content_manager'))
    )
  );

-- Concept_versions policies
CREATE POLICY "Admins and CMs can view concept_versions"
  ON concept_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role IN ('admin', 'content_manager'))
    )
  );

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
  SELECT version INTO v_current_version
  FROM concepts
  WHERE id = p_concept_id;

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'Concept not found: %', p_concept_id;
  END IF;

  v_new_version := v_current_version + 1;

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
-- Comments
-- =====================================================

COMMENT ON TABLE concepts IS 'Master library of TikTok concepts from hagen analysis and CM-created content';
COMMENT ON TABLE customer_concepts IS 'Customer-specific concept customizations and assignments';
COMMENT ON TABLE concept_versions IS 'Version history and audit trail for concept changes';

-- =====================================================
-- Done
-- =====================================================

SELECT 'Migration 007 complete - CLEAN INSTALL' as status;
