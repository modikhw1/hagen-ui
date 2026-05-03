-- =====================================================
-- Migration 018: Add NOT NULL + UNIQUE constraint on team_members.email
-- =====================================================
-- Makes email required (NOT NULL) and unique on the team_members table.
-- Handles existing NULL emails by setting a placeholder before applying constraints.
-- =====================================================

DO $$
DECLARE
  v_null_count INTEGER;
BEGIN
  -- Check for existing NULL emails
  SELECT COUNT(*) INTO v_null_count
  FROM team_members
  WHERE email IS NULL;

  IF v_null_count > 0 THEN
    RAISE WARNING 'Found % team_members with NULL email. These rows need an email before the NOT NULL constraint can be applied.', v_null_count;
    -- Update NULL emails to a placeholder to allow migration to proceed
    -- Admins should update these to real emails after migration
    UPDATE team_members
    SET email = CONCAT('unknown-', id, '@letrend.se')
    WHERE email IS NULL;
    RAISE NOTICE 'Updated % NULL emails with placeholder values. Please update them to real emails.', v_null_count;
  END IF;
END $$;

-- Add NOT NULL constraint on email
ALTER TABLE team_members
  ALTER COLUMN email SET NOT NULL;

-- Add UNIQUE constraint on email (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'team_members_email_unique'
      AND conrelid = 'team_members'::regclass
  ) THEN
    ALTER TABLE team_members
      ADD CONSTRAINT team_members_email_unique UNIQUE (email);
    RAISE NOTICE 'Added UNIQUE constraint on team_members.email';
  ELSE
    RAISE NOTICE 'UNIQUE constraint already exists on team_members.email, skipping';
  END IF;
END $$;

-- =====================================================
-- Done
-- =====================================================

SELECT 'Migration 018 complete - team_members_email_required' AS status;
