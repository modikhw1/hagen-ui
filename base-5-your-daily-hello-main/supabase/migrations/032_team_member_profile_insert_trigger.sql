-- =====================================================================
-- Migration 032: Auto-link team_members.profile_id on profiles INSERT
-- =====================================================================
-- Purpose: When a new profiles row is created (invite acceptance,
-- first login, or any auth signup), automatically set profile_id on
-- any team_members row whose email matches the incoming profile,
-- provided profile_id is currently NULL.
--
-- Context:
--   Migration 016 added the profile_id column to team_members.
--   Migration 017 backfilled account_manager_profile_id via name match.
--   E9 (app code) links profile_id when the profile already exists at
--     team_members creation time.
--   This migration closes the remaining gap: a new CM is added via
--     /admin/team, invited, and creates their auth account later.
--     At that point profiles INSERT fires, and this trigger links the
--     two rows immediately.
--
-- Match logic:
--   lower(trim(team_members.email)) = lower(trim(NEW.email))
--   AND team_members.profile_id IS NULL
--
-- Role gate: intentionally absent. profiles.role is not set at INSERT
-- time (the handle_new_user trigger only writes id, email, business_name).
-- Gating on role would make the trigger permanently ineffective.
--
-- Safety: only overwrites NULL — never touches an existing profile_id.
--
-- Idempotency: CREATE OR REPLACE FUNCTION + DROP/CREATE trigger.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. Trigger function
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_team_member_on_profile_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.team_members
  SET profile_id = NEW.id
  WHERE lower(trim(email)) = lower(trim(NEW.email))
    AND profile_id IS NULL;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Attach trigger to profiles AFTER INSERT
-- ─────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_link_team_member_on_profile_insert ON public.profiles;

CREATE TRIGGER trg_link_team_member_on_profile_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.link_team_member_on_profile_insert();

-- ─────────────────────────────────────────────────────────────────────
-- Done
-- ─────────────────────────────────────────────────────────────────────
SELECT 'Migration 032 complete - team_member_profile_insert_trigger' AS status;
