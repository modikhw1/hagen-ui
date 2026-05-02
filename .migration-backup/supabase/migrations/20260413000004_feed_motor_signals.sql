-- ─────────────────────────────────────────────────────────────────────────────
-- feed_motor_signals (Task 3)
--
-- Stores persistent nudge signals for the feed motor.
-- Replaces the ephemeral column-based approach on customer_profiles so that
-- CM can see signals even after auto-reconcile has resolved them.
--
-- States:
--   acknowledged_at IS NULL AND auto_resolved_at IS NULL  → active nudge (show to CM)
--   auto_resolved_at IS NOT NULL                          → auto-resolved (subtle badge)
--   acknowledged_at IS NOT NULL                           → CM acknowledged / dismissed
--
-- RLS: admin and content_manager can read/write; customers can read their own.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feed_motor_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  signal_type text NOT NULL DEFAULT 'nudge',
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  acknowledged_at timestamptz,
  auto_resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS feed_motor_signals_customer_id_idx
  ON feed_motor_signals (customer_id);

CREATE INDEX IF NOT EXISTS feed_motor_signals_active_idx
  ON feed_motor_signals (customer_id)
  WHERE acknowledged_at IS NULL AND auto_resolved_at IS NULL;

-- Enable Row Level Security
ALTER TABLE feed_motor_signals ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated staff (admin/content_manager) can read and write all signals
DROP POLICY IF EXISTS "staff_all" ON feed_motor_signals;
CREATE POLICY "staff_all" ON feed_motor_signals
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
