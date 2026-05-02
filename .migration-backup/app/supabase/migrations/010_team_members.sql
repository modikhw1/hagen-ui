-- Migration: Add team members table
-- Purpose: Store Content Manager details with contact info
-- Date: 2026-03-03

-- =====================================================
-- 1. Team Members Table
-- =====================================================
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Basic info
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'content_manager' CHECK (role IN ('admin', 'content_manager', 'designer', 'other')),

  -- Display
  color TEXT NOT NULL DEFAULT '#4f46e5',
  avatar_url TEXT,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_team_members_role ON team_members(role);
CREATE INDEX idx_team_members_active ON team_members(is_active);
CREATE INDEX idx_team_members_profile ON team_members(profile_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_team_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION update_team_members_updated_at();

-- =====================================================
-- 2. Enable Row Level Security (RLS)
-- =====================================================
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Admins can see all team members
CREATE POLICY "Admins can view all team members"
  ON team_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'admin')
    )
  );

-- Admins can manage team members
CREATE POLICY "Admins can manage team members"
  ON team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'admin')
    )
  );

-- =====================================================
-- 3. Seed initial team members
-- =====================================================
INSERT INTO team_members (name, role, color, is_active) VALUES
  ('Mahmoud', 'content_manager', '#4f46e5', true),
  ('Emil', 'content_manager', '#10b981', true),
  ('Johanna', 'content_manager', '#f59e0b', true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 4. Comments
-- =====================================================
COMMENT ON TABLE team_members IS 'Stores Content Manager and team member details with contact information';
COMMENT ON COLUMN team_members.color IS 'Display color for team member in UI (hex code)';
COMMENT ON COLUMN team_members.profile_id IS 'Link to profiles table if team member has a user account';

-- =====================================================
-- Migration Complete
-- =====================================================
