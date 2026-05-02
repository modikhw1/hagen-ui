-- ============================================
-- Migration 006: Role-Based Access Control
-- ============================================
-- Description: Adds role management system for admin, content_manager, customer, and user roles
-- Replaces hardcoded email whitelists with proper database-driven role management

-- ============================================
-- 1. Create user role enum type
-- ============================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'content_manager', 'customer', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 2. Add role column to profiles table
-- ============================================
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'user';

-- ============================================
-- 3. Set existing admin users to 'admin' role
-- ============================================
UPDATE profiles
SET role = 'admin'
WHERE is_admin = true OR email = 'modikhw@gmail.com';

-- Set known content managers
UPDATE profiles
SET role = 'content_manager'
WHERE email IN ('mahmoud@letrend.se', 'hej@letrend.se');

-- ============================================
-- 4. Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email_role ON profiles(email, role);

-- ============================================
-- 5. Helper functions for role checking
-- ============================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = true OR role = 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_content_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = true OR role IN ('admin', 'content_manager'))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_customer()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'customer'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. Update RLS policies for customer_profiles
-- ============================================
-- Drop existing overly permissive policies if any
DROP POLICY IF EXISTS "Service role full access" ON customer_profiles;
DROP POLICY IF EXISTS "Public read access" ON customer_profiles;

-- Create granular RLS policies
CREATE POLICY "Admins and CMs can view customer_profiles"
  ON customer_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role IN ('admin', 'content_manager'))
    )
  );

CREATE POLICY "Only admins can insert customer_profiles"
  ON customer_profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'admin')
    )
  );

CREATE POLICY "Only admins can update customer_profiles"
  ON customer_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'admin')
    )
  );

CREATE POLICY "Only admins can delete customer_profiles"
  ON customer_profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'admin')
    )
  );

-- ============================================
-- 7. Update RLS policies for email_schedules
-- ============================================
DROP POLICY IF EXISTS "Public access to email_schedules" ON email_schedules;

CREATE POLICY "Admins and CMs can manage email_schedules"
  ON email_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role IN ('admin', 'content_manager'))
    )
  );

-- ============================================
-- 8. Create audit log table (for future use)
-- ============================================
CREATE TABLE IF NOT EXISTS role_changes_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  old_role user_role,
  new_role user_role NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_role_changes_profile ON role_changes_log(profile_id, changed_at DESC);

-- ============================================
-- 9. Function to change user role (with audit log)
-- ============================================
CREATE OR REPLACE FUNCTION change_user_role(
  target_user_id UUID,
  new_role user_role,
  reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  old_role user_role;
  admin_check BOOLEAN;
BEGIN
  -- Check if caller is admin
  SELECT is_admin() INTO admin_check;

  IF NOT admin_check THEN
    RAISE EXCEPTION 'Only admins can change user roles';
  END IF;

  -- Get current role
  SELECT role INTO old_role
  FROM profiles
  WHERE id = target_user_id;

  IF old_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Update role
  UPDATE profiles
  SET role = new_role
  WHERE id = target_user_id;

  -- Log the change
  INSERT INTO role_changes_log (profile_id, old_role, new_role, changed_by, reason)
  VALUES (target_user_id, old_role, new_role, auth.uid(), reason);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 10. Comments for documentation
-- ============================================
COMMENT ON TABLE profiles IS 'User profiles with role-based access control';
COMMENT ON COLUMN profiles.role IS 'User role: admin (full access), content_manager (studio access), customer (limited access), user (default)';
COMMENT ON FUNCTION is_admin() IS 'Returns true if current user is admin';
COMMENT ON FUNCTION is_content_manager() IS 'Returns true if current user is admin or content manager';
COMMENT ON FUNCTION change_user_role(UUID, user_role, TEXT) IS 'Admin-only function to change user roles with audit logging';

-- ============================================
-- Migration complete
-- ============================================
-- Run this migration via Supabase SQL Editor or CLI:
-- supabase migration apply 006_role_based_access.sql
