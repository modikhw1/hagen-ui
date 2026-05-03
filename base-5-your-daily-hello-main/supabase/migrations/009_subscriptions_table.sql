-- Migration: Add subscriptions tracking
-- Purpose: Track Stripe subscriptions for visibility and management
-- Date: 2026-03-03

-- =====================================================
-- 1. Subscriptions Table
-- =====================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  customer_profile_id UUID REFERENCES customer_profiles(id) ON DELETE SET NULL,
  user_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Subscription details
  status TEXT NOT NULL CHECK (status IN ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  cancel_at_period_end BOOLEAN DEFAULT FALSE,

  -- Pricing
  currency TEXT NOT NULL DEFAULT 'sek',
  amount INTEGER NOT NULL DEFAULT 0, -- Amount in smallest currency unit (öre)
  interval TEXT CHECK (interval IN ('day', 'week', 'month', 'year')),
  interval_count INTEGER DEFAULT 1,

  -- Period tracking
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,

  -- Cancellation
  canceled_at TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Timestamps
  created TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Match Stripe's created field
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX idx_subscriptions_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_profile ON subscriptions(customer_profile_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();

-- =====================================================
-- 2. Enable Row Level Security (RLS)
-- =====================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view their own subscriptions
CREATE POLICY "Users can view own subscriptions via user_profile"
  ON subscriptions FOR SELECT
  USING (
    auth.uid() = subscriptions.user_profile_id
  );

-- Allow service role (API) to manage all subscriptions
CREATE POLICY "Service role has full access to subscriptions"
  ON subscriptions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =====================================================
-- 3. Grant Permissions
-- =====================================================
GRANT SELECT ON subscriptions TO authenticated;
GRANT ALL ON subscriptions TO service_role;

-- =====================================================
-- 4. Comments for Documentation
-- =====================================================
COMMENT ON TABLE subscriptions IS 'Tracks all Stripe subscriptions for complete visibility';
COMMENT ON COLUMN subscriptions.stripe_subscription_id IS 'Unique Stripe subscription ID (sub_xxx)';
COMMENT ON COLUMN subscriptions.status IS 'Subscription status from Stripe (active, canceled, etc.)';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS 'True if subscription will cancel at period end';
COMMENT ON COLUMN subscriptions.amount IS 'Subscription amount in smallest currency unit (öre for SEK)';

-- =====================================================
-- Migration Complete
-- =====================================================
