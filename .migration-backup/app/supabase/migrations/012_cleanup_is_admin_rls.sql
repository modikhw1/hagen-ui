-- =====================================================
-- Migration 012: Cleanup is_admin Column References in RLS
-- =====================================================
-- Purpose: Remove all `profiles.is_admin = true` checks from RLS policies.
--          Replace with role-based checks only: `profiles.role = 'admin'`.
--
-- Problem: Migrations 006–010 created policies with dual checks:
--   (profiles.is_admin = true OR profiles.role = 'admin')
-- The `is_admin` column is a legacy boolean that creates a redundant
-- control path. An attacker who sets is_admin=true bypasses role checks.
-- All access control should go through the role column exclusively.
--
-- Tables affected:
--   concepts, customer_concepts, concept_versions (migration 007)
--   customer_profiles, email_schedules (migration 006)
--   cm_activities (migration 008)
--   team_members (migration 010)
--   cm_tags, collections, invites, email_jobs, email_log (schema-level)
-- =====================================================

-- =====================================================
-- 1. Update helper functions to remove is_admin dependency
-- =====================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_content_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'content_manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 2. concepts table (migration 007)
-- =====================================================

DROP POLICY IF EXISTS "Admins and CMs can view all concepts" ON concepts;
DROP POLICY IF EXISTS "Admins can manage concepts" ON concepts;

CREATE POLICY "Admins and CMs can view all concepts"
  ON concepts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'content_manager')
    )
  );

CREATE POLICY "Admins can manage concepts"
  ON concepts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 3. customer_concepts table (migration 007)
-- =====================================================

DROP POLICY IF EXISTS "Admins and CMs can view all customer_concepts" ON customer_concepts;
DROP POLICY IF EXISTS "Admins and CMs can manage customer_concepts" ON customer_concepts;

CREATE POLICY "Admins and CMs can view all customer_concepts"
  ON customer_concepts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'content_manager')
    )
  );

CREATE POLICY "Admins and CMs can manage customer_concepts"
  ON customer_concepts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'content_manager')
    )
  );

-- =====================================================
-- 4. concept_versions table (migration 007)
-- =====================================================

DROP POLICY IF EXISTS "Admins and CMs can view concept_versions" ON concept_versions;
DROP POLICY IF EXISTS "Admins can create concept_versions" ON concept_versions;

CREATE POLICY "Admins and CMs can view concept_versions"
  ON concept_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'content_manager')
    )
  );

CREATE POLICY "Admins can create concept_versions"
  ON concept_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 5. customer_profiles table (migration 006)
-- =====================================================

DROP POLICY IF EXISTS "Admins and CMs can view customer_profiles" ON customer_profiles;
DROP POLICY IF EXISTS "Only admins can insert customer_profiles" ON customer_profiles;
DROP POLICY IF EXISTS "Only admins can update customer_profiles" ON customer_profiles;
DROP POLICY IF EXISTS "Only admins can delete customer_profiles" ON customer_profiles;

CREATE POLICY "Admins and CMs can view customer_profiles"
  ON customer_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'content_manager')
    )
  );

CREATE POLICY "Only admins can insert customer_profiles"
  ON customer_profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can update customer_profiles"
  ON customer_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete customer_profiles"
  ON customer_profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 6. email_schedules table (migration 006)
-- =====================================================

DROP POLICY IF EXISTS "Admins and CMs can manage email_schedules" ON email_schedules;

CREATE POLICY "Admins and CMs can manage email_schedules"
  ON email_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'content_manager')
    )
  );

-- =====================================================
-- 7. cm_activities table (migration 008)
-- =====================================================

DROP POLICY IF EXISTS "Admins can view all CM activities" ON cm_activities;
DROP POLICY IF EXISTS "CMs and Admins can log activities" ON cm_activities;

CREATE POLICY "Admins can view all CM activities"
  ON cm_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "CMs and Admins can log activities"
  ON cm_activities FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'content_manager')
    )
  );

-- =====================================================
-- 8. team_members table (migration 010)
-- =====================================================

DROP POLICY IF EXISTS "Admins can view all team members" ON team_members;
DROP POLICY IF EXISTS "Admins can manage team members" ON team_members;

CREATE POLICY "Admins can view all team members"
  ON team_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage team members"
  ON team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 9. Additional tables (drop is_admin policies if they exist)
--    These tables may have is_admin references from earlier schema versions
-- =====================================================

-- cm_tags
DROP POLICY IF EXISTS "Admins can manage cm_tags" ON cm_tags;
DROP POLICY IF EXISTS "Admins and CMs can view cm_tags" ON cm_tags;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cm_tags') THEN
    EXECUTE $policy$
      CREATE POLICY "Admins and CMs can view cm_tags"
        ON cm_tags FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'content_manager')
          )
        );
      CREATE POLICY "Admins can manage cm_tags"
        ON cm_tags FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
          )
        );
    $policy$;
  END IF;
END $$;

-- invites
DROP POLICY IF EXISTS "Admins can manage invites" ON invites;
DROP POLICY IF EXISTS "Admins and CMs can view invites" ON invites;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invites') THEN
    EXECUTE $policy$
      CREATE POLICY "Admins and CMs can view invites"
        ON invites FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'content_manager')
          )
        );
      CREATE POLICY "Admins can manage invites"
        ON invites FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
          )
        );
    $policy$;
  END IF;
END $$;

-- email_jobs
DROP POLICY IF EXISTS "Admins can manage email_jobs" ON email_jobs;
DROP POLICY IF EXISTS "Admins and CMs can view email_jobs" ON email_jobs;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_jobs') THEN
    EXECUTE $policy$
      CREATE POLICY "Admins and CMs can view email_jobs"
        ON email_jobs FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'content_manager')
          )
        );
      CREATE POLICY "Admins can manage email_jobs"
        ON email_jobs FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
          )
        );
    $policy$;
  END IF;
END $$;

-- email_log
DROP POLICY IF EXISTS "Admins can view email_log" ON email_log;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_log') THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can view email_log"
        ON email_log FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
          )
        );
    $policy$;
  END IF;
END $$;

-- collections
DROP POLICY IF EXISTS "Admins can manage collections" ON collections;
DROP POLICY IF EXISTS "Admins and CMs can view collections" ON collections;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'collections') THEN
    EXECUTE $policy$
      CREATE POLICY "Admins and CMs can view collections"
        ON collections FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'content_manager')
          )
        );
      CREATE POLICY "Admins can manage collections"
        ON collections FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
          )
        );
    $policy$;
  END IF;
END $$;

-- customer_notes
DROP POLICY IF EXISTS "Admins and CMs can view customer_notes" ON customer_notes;
DROP POLICY IF EXISTS "Admins and CMs can manage customer_notes" ON customer_notes;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_notes') THEN
    EXECUTE $policy$
      CREATE POLICY "Admins and CMs can view customer_notes"
        ON customer_notes FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'content_manager')
          )
        );
      CREATE POLICY "Admins and CMs can manage customer_notes"
        ON customer_notes FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'content_manager')
          )
        );
    $policy$;
  END IF;
END $$;

-- =====================================================
-- Migration complete
-- =====================================================
-- NOTE: After running this migration, the `profiles.is_admin` column
-- can be dropped in a subsequent migration once all application code
-- has been updated to use role-based checks only.
-- =====================================================
