-- =====================================================================
-- Migration 033: Add tiktok_handle and last_history_sync_at to customer_profiles
-- =====================================================================
-- Purpose: Enables handle-based TikTok history sync.
--   tiktok_handle       — the customer's TikTok account handle (e.g. @brandname).
--                         Set/edited by CMs in the customer workspace.
--   last_history_sync_at — timestamp of the last successful "Synca historik"
--                         trigger. Displayed in the workspace for staleness awareness.
-- =====================================================================

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS tiktok_handle TEXT,
  ADD COLUMN IF NOT EXISTS last_history_sync_at TIMESTAMPTZ;

SELECT 'Migration 033 complete - customer_profiles tiktok_handle + last_history_sync_at' AS status;
