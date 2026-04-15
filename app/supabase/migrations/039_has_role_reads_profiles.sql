-- =====================================================================
-- Migration 039: Rewrite has_role() to read from profiles
-- =====================================================================
-- Problem: has_role() reads from user_roles, but the application never
-- writes to user_roles — it writes to profiles.role exclusively.
-- This means RLS policies that depend on has_role() (collections admin
-- access, user_roles admin read) are effectively broken for all users.
--
-- Fix: Rewrite has_role() to read from profiles instead.  profiles.role
-- is user_role enum while _role arg is app_role enum — both have
-- identical values, so we cast to text for comparison.  Also honour
-- the legacy is_admin boolean flag (admin role if is_admin = true).
--
-- This makes profiles the single source of truth for roles at every
-- layer: client, API, middleware, and DB-level RLS.
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
    FROM public.profiles
    WHERE id = _user_id
      AND (
        role::text = _role::text
        OR (_role::text = 'admin' AND is_admin = true)
      )
  )
$$;
