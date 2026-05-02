-- Motor signal: tracks unacknowledged advance cue from profile history sync.
-- Non-null = new imported_history rows arrived that CM has not yet acknowledged
--            by advancing the plan. Value = clip count from most recent sync.
-- NULL     = no pending cue (never had one, or CM already advanced).
--
-- Written by: fetch-profile-history, sync-history, import-history (when imported > 0)
-- Cleared by: advance-plan (after successful advance)
ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS pending_history_advance SMALLINT DEFAULT NULL;
