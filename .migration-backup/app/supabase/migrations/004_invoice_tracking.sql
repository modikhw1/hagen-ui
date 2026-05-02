-- Migration: Add invoice tracking and Stripe sync logging
-- Purpose: Track all Stripe invoices and sync events between Stripe and Supabase
-- Date: 2026-03-03

-- =====================================================
-- 1. Invoices Table
-- =====================================================
-- Tracks all invoices from Stripe for full visibility
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_invoice_id TEXT UNIQUE NOT NULL,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT NOT NULL,
  customer_profile_id UUID REFERENCES customer_profiles(id) ON DELETE SET NULL,
  user_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Financial data
  amount_due INTEGER NOT NULL DEFAULT 0,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'sek',

  -- Status tracking
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),

  -- URLs and documents
  hosted_invoice_url TEXT,
  invoice_pdf TEXT,

  -- Timestamps
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX idx_invoices_customer ON invoices(stripe_customer_id);
CREATE INDEX idx_invoices_subscription ON invoices(stripe_subscription_id);
CREATE INDEX idx_invoices_profile ON invoices(customer_profile_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_created ON invoices(created_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_invoices_updated_at();

-- =====================================================
-- 2. Stripe Sync Log Table
-- =====================================================
-- Tracks all sync events for debugging and idempotency
CREATE TABLE IF NOT EXISTS stripe_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identification
  event_type TEXT NOT NULL,
  stripe_event_id TEXT UNIQUE,

  -- Object information
  object_type TEXT CHECK (object_type IN ('customer', 'subscription', 'invoice', 'payment_method', 'other')),
  object_id TEXT,

  -- Sync metadata
  sync_direction TEXT CHECK (sync_direction IN ('stripe_to_supabase', 'supabase_to_stripe')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
  error_message TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups and idempotency checks
CREATE INDEX idx_sync_log_event ON stripe_sync_log(stripe_event_id);
CREATE INDEX idx_sync_log_status ON stripe_sync_log(status);
CREATE INDEX idx_sync_log_type ON stripe_sync_log(event_type);
CREATE INDEX idx_sync_log_created ON stripe_sync_log(created_at DESC);

-- =====================================================
-- 3. Comments for Documentation
-- =====================================================
COMMENT ON TABLE invoices IS 'Tracks all Stripe invoices for complete visibility and sync';
COMMENT ON COLUMN invoices.stripe_invoice_id IS 'Unique Stripe invoice ID (in_xxx)';
COMMENT ON COLUMN invoices.status IS 'Invoice status: draft, open, paid, void, or uncollectible';
COMMENT ON COLUMN invoices.amount_due IS 'Total amount due in smallest currency unit (öre for SEK)';
COMMENT ON COLUMN invoices.amount_paid IS 'Amount paid in smallest currency unit';

COMMENT ON TABLE stripe_sync_log IS 'Audit log for all Stripe sync events, provides idempotency and debugging';
COMMENT ON COLUMN stripe_sync_log.stripe_event_id IS 'Unique Stripe webhook event ID for idempotency';
COMMENT ON COLUMN stripe_sync_log.sync_direction IS 'Direction of sync: stripe_to_supabase or supabase_to_stripe';

-- =====================================================
-- 4. Enable Row Level Security (RLS)
-- =====================================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_sync_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view their own invoices
CREATE POLICY "Users can view own invoices via user_profile"
  ON invoices FOR SELECT
  USING (
    auth.uid() = invoices.user_profile_id
  );

-- Allow service role (API) to manage all invoices
CREATE POLICY "Service role has full access to invoices"
  ON invoices FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Only service role can access sync log
CREATE POLICY "Service role has full access to sync log"
  ON stripe_sync_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =====================================================
-- 5. Grant Permissions
-- =====================================================
-- Grant necessary permissions to authenticated users
GRANT SELECT ON invoices TO authenticated;
GRANT ALL ON invoices TO service_role;
GRANT ALL ON stripe_sync_log TO service_role;

-- =====================================================
-- Migration Complete
-- =====================================================
-- This migration adds:
-- 1. invoices table - tracks all Stripe invoices
-- 2. stripe_sync_log table - audit log for sync events
-- 3. Indexes for performance
-- 4. RLS policies for security
-- 5. Triggers for timestamp management
