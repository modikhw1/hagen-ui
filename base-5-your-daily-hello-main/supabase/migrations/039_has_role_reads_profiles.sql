-- =====================================================================
-- Legacy migration note
-- =====================================================================
-- The canonical migration chain lives under /supabase/migrations.
-- RBAC truth is public.user_roles + public.has_role(), not profiles.role.
-- Keep this legacy file aligned so accidental replays do not reintroduce
-- a conflicting role model.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;
