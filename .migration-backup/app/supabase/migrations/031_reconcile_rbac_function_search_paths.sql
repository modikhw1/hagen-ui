-- =====================================================================
-- Migration 031: Reconcile is_admin() and is_content_manager() search paths
-- =====================================================================
-- Purpose: Capture the OOB addition of SET search_path TO 'public' on
-- is_admin() and is_content_manager() so that fresh installs produce
-- function definitions that match the live DB exactly.
--
-- Root cause:
--   Migration 012 updated both functions to remove the is_admin column
--   fallback (correct). However, it did not include SET search_path TO
--   'public'. The live DB has this attribute — it was added OOB as a
--   security best practice for SECURITY DEFINER functions (prevents
--   search_path hijacking via untrusted schemas).
--
-- Scope: function attribute reconciliation only.
--   - is_admin():           body unchanged, SET search_path TO 'public' added
--   - is_content_manager(): body unchanged, SET search_path TO 'public' added
--   - is_customer():        NOT changed — live DB has no search_path on this
--                           function, exactly matching migration 006. No gap.
--
-- All statements are CREATE OR REPLACE — fully idempotent.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. is_admin()
-- ─────────────────────────────────────────────────────────────────────
-- Migration 012 body (current repo state):
--   SECURITY DEFINER, no search_path
-- Live DB body (verified via pg_get_functiondef):
--   SECURITY DEFINER, SET search_path TO 'public'
-- Body logic is identical — role = 'admin' check only, no is_admin column
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. is_content_manager()
-- ─────────────────────────────────────────────────────────────────────
-- Migration 012 body (current repo state):
--   SECURITY DEFINER, no search_path
-- Live DB body (verified via pg_get_functiondef):
--   SECURITY DEFINER, SET search_path TO 'public'
-- Body logic is identical — role IN ('admin','content_manager') only
CREATE OR REPLACE FUNCTION public.is_content_manager()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'content_manager')
  );
END;
$$;
