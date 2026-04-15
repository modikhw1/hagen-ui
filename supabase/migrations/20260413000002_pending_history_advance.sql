-- ─────────────────────────────────────────────────────────────────────────────
-- pending_history_advance columns (Task 9)
--
-- Adds two columns to customer_profiles for tracking in-progress
-- mark-produced operations. The pending_history_advance_at timestamp
-- signals "operation in progress" — frontend shows a badge when non-null
-- and older than 60 seconds.
--
-- Note: pending_history_advance (SMALLINT) already exists as the motor-signal
-- evidence count; pending_history_advance_at is a new companion column.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS pending_history_advance_at timestamptz;
