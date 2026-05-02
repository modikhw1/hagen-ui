-- =============================================
-- Migration 008: CM Activity Tracking & Customer Logos
-- =============================================
-- Purpose: Track Content Manager activities for admin oversight
--          and add customer logo support

-- Drop existing objects if they exist (safe to re-run)
DROP TABLE IF EXISTS cm_activities CASCADE;
DROP INDEX IF EXISTS idx_cm_activities_cm;
DROP INDEX IF EXISTS idx_cm_activities_customer;
DROP INDEX IF EXISTS idx_cm_activities_created;
DROP INDEX IF EXISTS idx_cm_activities_type;

-- =============================================
-- 1. CM Activities Table
-- =============================================
CREATE TABLE cm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cm_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cm_email TEXT NOT NULL,
  customer_profile_id UUID REFERENCES customer_profiles(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'concept_added',
    'concept_removed',
    'concept_customized',
    'email_sent',
    'gameplan_updated',
    'customer_created',
    'customer_updated',
    'customer_invited'
  )),
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_cm_activities_cm ON cm_activities(cm_email);
CREATE INDEX idx_cm_activities_customer ON cm_activities(customer_profile_id);
CREATE INDEX idx_cm_activities_created ON cm_activities(created_at DESC);
CREATE INDEX idx_cm_activities_type ON cm_activities(activity_type);

-- RLS Policies
ALTER TABLE cm_activities ENABLE ROW LEVEL SECURITY;

-- Admins can view all activities
CREATE POLICY "Admins can view all CM activities"
  ON cm_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'admin')
    )
  );

-- CMs can view their own activities
CREATE POLICY "CMs can view their own activities"
  ON cm_activities FOR SELECT
  USING (
    cm_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.email = cm_activities.cm_email
    )
  );

-- CMs and Admins can insert activities
CREATE POLICY "CMs and Admins can log activities"
  ON cm_activities FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.is_admin = true OR
        profiles.role IN ('admin', 'content_manager')
      )
    )
  );

-- =============================================
-- 2. Add Logo Support to Customer Profiles
-- =============================================

-- Add logo_url column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_profiles'
    AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE customer_profiles ADD COLUMN logo_url TEXT;
  END IF;
END $$;

-- =============================================
-- 3. Helper Function: Log CM Activity
-- =============================================
CREATE OR REPLACE FUNCTION log_cm_activity(
  p_cm_user_id UUID,
  p_cm_email TEXT,
  p_customer_profile_id UUID,
  p_activity_type TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO cm_activities (
    cm_user_id,
    cm_email,
    customer_profile_id,
    activity_type,
    description,
    metadata
  ) VALUES (
    p_cm_user_id,
    p_cm_email,
    p_customer_profile_id,
    p_activity_type,
    p_description,
    p_metadata
  ) RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 4. Sample Data (Optional - for testing)
-- =============================================

-- Uncomment to add sample activities for testing
/*
INSERT INTO cm_activities (cm_email, customer_profile_id, activity_type, description, metadata)
SELECT
  'content@letrend.se',
  id,
  'concept_added',
  'Lade till koncept: Snabba hacks',
  '{"concept_id": "quick-hacks-001", "match_percentage": 92}'::jsonb
FROM customer_profiles
WHERE status = 'active'
LIMIT 3;
*/

-- =============================================
-- 5. Verification Queries
-- =============================================

-- Check table structure
COMMENT ON TABLE cm_activities IS 'Tracks Content Manager activities for admin oversight';
COMMENT ON COLUMN cm_activities.activity_type IS 'Type of activity performed';
COMMENT ON COLUMN cm_activities.metadata IS 'Additional context about the activity (concept_id, email_id, etc)';

-- Grant permissions
GRANT SELECT, INSERT ON cm_activities TO authenticated;
GRANT EXECUTE ON FUNCTION log_cm_activity TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 008 completed successfully';
  RAISE NOTICE '   - cm_activities table created';
  RAISE NOTICE '   - Activity logging function added';
  RAISE NOTICE '   - Customer logo support added';
  RAISE NOTICE '   - RLS policies configured';
END $$;
