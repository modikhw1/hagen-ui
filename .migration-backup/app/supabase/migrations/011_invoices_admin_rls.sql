-- =====================================================
-- Migration 011: Admin RLS for Invoices
-- =====================================================
-- Purpose: Add admin-level RLS policies to invoices and stripe_sync_log
-- Problem: Migration 004 only added service_role and user-self policies.
--          Admin users could not view or manage invoices via the admin UI.
-- =====================================================

-- =====================================================
-- 1. Admin policies for invoices table
-- =====================================================

-- Drop any existing admin policies to avoid conflicts
DROP POLICY IF EXISTS "Admins can view all invoices" ON invoices;
DROP POLICY IF EXISTS "Admins can manage all invoices" ON invoices;
DROP POLICY IF EXISTS "Admins and CMs can view all invoices" ON invoices;

-- Admins can view all invoices
CREATE POLICY "Admins can view all invoices"
  ON invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- CMs can view invoices for customers assigned to them
CREATE POLICY "CMs can view invoices for their customers"
  ON invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'content_manager'
      AND EXISTS (
        SELECT 1 FROM customer_profiles cp
        WHERE cp.id = invoices.customer_profile_id
        AND cp.assigned_cm_id = p.id
      )
    )
  );

-- Admins can insert invoices (e.g. manual invoice creation)
CREATE POLICY "Admins can insert invoices"
  ON invoices FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins can update invoices (e.g. syncing data, corrections)
CREATE POLICY "Admins can update invoices"
  ON invoices FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins can delete invoices (e.g. test data cleanup)
CREATE POLICY "Admins can delete invoices"
  ON invoices FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 2. Admin policies for stripe_sync_log
-- =====================================================

DROP POLICY IF EXISTS "Admins can view sync log" ON stripe_sync_log;

-- Admins can view sync log for debugging
CREATE POLICY "Admins can view sync log"
  ON stripe_sync_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 3. Add UNIQUE constraint on stripe_invoice_id if missing
--    (invoices can arrive via webhook AND create-subscription-from-profile)
-- =====================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'invoices'
    AND constraint_name = 'invoices_stripe_invoice_id_unique'
    AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_stripe_invoice_id_unique UNIQUE (stripe_invoice_id);
  END IF;
END $$;

-- =====================================================
-- Migration complete
-- =====================================================
