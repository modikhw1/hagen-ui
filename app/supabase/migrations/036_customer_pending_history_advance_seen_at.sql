-- Acknowledgement layer for the profile-driven motor signal.
-- Allows CM to express "I have seen this signal, not advancing yet"
-- without collapsing it into the same state as "plan advanced".
--
-- Three distinct states on customer_profiles:
--   pending_history_advance IS NULL                        → nothing pending
--   pending_history_advance IS NOT NULL, seen_at IS NULL   → new evidence, unacknowledged
--   pending_history_advance IS NOT NULL, seen_at IS NOT NULL → CM acknowledged, not yet advanced
--
-- Written by: dismiss action in UI (via PATCH /profile)
-- Cleared by: advance-plan (alongside pending_history_advance)
-- Reset by: any sync route writing new evidence (clears seen_at so fresh evidence re-surfaces)
ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS pending_history_advance_seen_at TIMESTAMPTZ DEFAULT NULL;
