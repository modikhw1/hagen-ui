-- =====================================================
-- Migration 013: Customer Mobile App Access
-- =====================================================
-- Purpose: Allow customers (role = 'customer') to read their own
--          data from the mobile app using JWT-based auth (anon key).
--
-- Problem: Migrations 006–012 left all policies for customer_profiles,
--          concepts, and customer_notes restricted to admin/CM only.
--          Mobile app users have role = 'customer' and cannot read:
--            - their own customer_profile  → AuthContext returns null
--            - concepts joined via customer_concepts → backend_data is null
--            - customer_notes → game plan notes are empty
--
-- Tables affected:
--   customer_profiles  → customers read own profile (via matching_data)
--   concepts           → customers read concepts assigned to them
--   customer_notes     → customers read notes written about them
-- =====================================================

-- =====================================================
-- 1. customer_profiles: customers can read their own
-- =====================================================
DROP POLICY IF EXISTS "Customers can view own customer_profile" ON customer_profiles;

CREATE POLICY "Customers can view own customer_profile"
  ON customer_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.matching_data->>'customer_profile_id' = customer_profiles.id::text
    )
  );

-- =====================================================
-- 2. concepts: customers can read concepts assigned to them
-- =====================================================
DROP POLICY IF EXISTS "Customers can view their assigned concepts" ON concepts;

CREATE POLICY "Customers can view their assigned concepts"
  ON concepts FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM customer_concepts cc
      JOIN profiles p ON p.id = auth.uid()
      WHERE cc.concept_id = concepts.id
        AND p.matching_data->>'customer_profile_id' = cc.customer_profile_id::text
    )
  );

-- =====================================================
-- 3. customer_notes: customers can read notes about them
-- =====================================================
DROP POLICY IF EXISTS "Customers can view their own notes" ON customer_notes;

CREATE POLICY "Customers can view their own notes"
  ON customer_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.matching_data->>'customer_profile_id' = customer_notes.customer_id::text
    )
  );

-- =====================================================
-- Migration complete
-- =====================================================
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- or via CLI: supabase db push
--
-- Verify with:
--   SELECT schemaname, tablename, policyname, cmd, qual
--   FROM pg_policies
--   WHERE tablename IN ('customer_profiles', 'concepts', 'customer_notes')
--   ORDER BY tablename, policyname;
