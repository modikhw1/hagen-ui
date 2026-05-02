-- =====================================================
-- Migration 016: Ensure team_members has profile_id column
-- =====================================================
-- Adds profile_id UUID REFERENCES auth.users(id) to team_members
-- if it doesn't already exist (idempotent).
-- Also adds an index on email for faster invite-accept lookups.
-- =====================================================

-- Add profile_id column if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'team_members'
      AND column_name = 'profile_id'
  ) THEN
    ALTER TABLE team_members
      ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

    CREATE INDEX idx_team_members_profile_id ON team_members(profile_id);
    RAISE NOTICE 'Added profile_id column to team_members';
  ELSE
    RAISE NOTICE 'profile_id column already exists on team_members, skipping';
  END IF;
END $$;

-- Add index on email for invite-accept lookups (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE tablename = 'team_members'
      AND indexname = 'idx_team_members_email'
  ) THEN
    CREATE INDEX idx_team_members_email ON team_members(email);
    RAISE NOTICE 'Added email index to team_members';
  ELSE
    RAISE NOTICE 'Email index already exists on team_members, skipping';
  END IF;
END $$;

-- =====================================================
-- Done
-- =====================================================

SELECT 'Migration 016 complete - team_member_profile_link' AS status;
