-- Unified history sync pipeline support.
-- Adds per-customer sync locking, sync run logging, and removes
-- legacy pending-history motor signal columns once feed_motor_signals
-- is the single source of truth.

ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS operation_lock_until timestamptz;

CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('cron', 'manual', 'mark_produced')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error')),
  fetched_count int DEFAULT 0,
  imported_count int DEFAULT 0,
  stats_updated_count int DEFAULT 0,
  reconciled boolean DEFAULT false,
  error text
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_customer
  ON sync_runs (customer_id, started_at DESC);

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sync_runs'
      AND policyname = 'staff_all'
  ) THEN
    CREATE POLICY "staff_all" ON sync_runs
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

ALTER TABLE customer_profiles
  DROP COLUMN IF EXISTS pending_history_advance,
  DROP COLUMN IF EXISTS pending_history_advance_seen_at,
  DROP COLUMN IF EXISTS pending_history_advance_published_at;
