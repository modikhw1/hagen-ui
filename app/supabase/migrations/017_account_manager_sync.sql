-- =====================================================
-- Migration 017: Ensure account_manager_profile_id column exists
-- and backfill from profiles/team_members where possible
-- =====================================================
-- Ensures customer_profiles.account_manager_profile_id (UUID) exists.
-- Backfills the column by matching account_manager name against
-- team_members.name -> team_members.profile_id.
-- =====================================================

-- Add account_manager_profile_id column if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'customer_profiles'
      AND column_name = 'account_manager_profile_id'
  ) THEN
    ALTER TABLE customer_profiles
      ADD COLUMN account_manager_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

    CREATE INDEX idx_customer_profiles_am_profile_id
      ON customer_profiles(account_manager_profile_id);

    RAISE NOTICE 'Added account_manager_profile_id column to customer_profiles';
  ELSE
    RAISE NOTICE 'account_manager_profile_id already exists on customer_profiles, skipping';
  END IF;
END $$;

-- Backfill account_manager_profile_id for rows that have an account_manager name
-- but a NULL profile_id. Joins through team_members -> profiles.
UPDATE customer_profiles cp
SET account_manager_profile_id = tm.profile_id
FROM team_members tm
WHERE cp.account_manager IS NOT NULL
  AND cp.account_manager_profile_id IS NULL
  AND tm.profile_id IS NOT NULL
  AND lower(trim(cp.account_manager)) = lower(trim(tm.name));

-- =====================================================
-- Done
-- =====================================================

SELECT
  COUNT(*) FILTER (WHERE account_manager IS NOT NULL) AS has_manager,
  COUNT(*) FILTER (WHERE account_manager_profile_id IS NOT NULL) AS has_manager_profile_id,
  COUNT(*) FILTER (WHERE account_manager IS NOT NULL AND account_manager_profile_id IS NULL) AS missing_profile_id
FROM customer_profiles;
