-- =====================================================
-- Migration 020: Admin RLS for Subscriptions
-- =====================================================
-- Problem: Migration 009 only added user-self and service_role policies.
--          Admin users cannot view subscriptions in the admin UI.
-- =====================================================

-- Drop if re-running
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admins can manage subscriptions" ON subscriptions;

-- Admins can view all subscriptions
CREATE POLICY "Admins can view all subscriptions"
  ON subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- CMs can view subscriptions for their assigned customers
CREATE POLICY "CMs can view subscriptions for their customers"
  ON subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'content_manager'
      AND EXISTS (
        SELECT 1 FROM customer_profiles cp
        WHERE cp.id = subscriptions.customer_profile_id
        AND cp.account_manager_profile_id = p.id
      )
    )
  );

-- Admins can insert/update/delete subscriptions (for sync)
CREATE POLICY "Admins can insert subscriptions"
  ON subscriptions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update subscriptions"
  ON subscriptions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- Migration complete
-- =====================================================
