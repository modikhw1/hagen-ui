-- Freshness seam for the profile-driven motor signal.
-- Stores the published_at of the most recently published TikTok clip
-- in the batch that triggered the current pending_history_advance signal.
--
-- Allows future motor logic to distinguish:
--   - fresh batch: pending_history_advance_published_at is recent → real publication activity
--   - backfill batch: pending_history_advance_published_at is old → historical import, not new activity
--
-- Written by: fetch-profile-history, sync-history, import-history (alongside pending_history_advance)
-- Cleared by: advance-plan (alongside pending_history_advance and seen_at)
-- Never cleared by: dismiss/acknowledge (evidence context survives acknowledgement)
ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS pending_history_advance_published_at TIMESTAMPTZ DEFAULT NULL;
