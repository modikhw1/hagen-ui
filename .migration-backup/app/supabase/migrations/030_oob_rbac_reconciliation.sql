-- =====================================================================
-- Migration 030: OOB RBAC reconciliation
-- =====================================================================
-- Purpose: Capture four out-of-band RBAC objects that exist in the live
-- DB but have no coverage in migration history:
--
--   1. app_role enum (OOB — live DB has both app_role and user_role enums)
--   2. user_roles table (OOB — id UUID PK, user_id UUID, role app_role,
--      UNIQUE(user_id,role), RLS enabled)
--   3. has_role() function (OOB — SQL, STABLE, SECURITY DEFINER,
--      search_path=public, args: _user_id uuid, _role app_role)
--   4. user_roles RLS policies (OOB — two SELECT-only policies for
--      authenticated users reading own role or admins reading all)
--   5. collections RLS (OOB — table created in migration 025 with RLS
--      intentionally disabled; enable + two policies using has_role())
--
-- This migration is a reconciliation pass: it does NOT change runtime
-- behaviour. All four objects already exist live. All statements are
-- idempotent so this is safe to apply to the live DB.
--
-- Dependency order: app_role → user_roles → has_role() → RLS policies
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. app_role enum
-- ─────────────────────────────────────────────────────────────────────
-- Live: exists as ENUM('admin','content_manager','customer','user')
-- Note: user_role (migration 006) and app_role are identical in values
-- but are separate types. The RBAC system (user_roles table, has_role(),
-- all downstream RLS policies) uses app_role exclusively.
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'admin',
    'content_manager',
    'customer',
    'user'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. user_roles table
-- ─────────────────────────────────────────────────────────────────────
-- Live schema (verified):
--   id      UUID PRIMARY KEY DEFAULT gen_random_uuid()
--   user_id UUID NOT NULL  (no FK — intentional on live DB)
--   role    app_role NOT NULL
--   UNIQUE  (user_id, role)
-- RLS: enabled
CREATE TABLE IF NOT EXISTS public.user_roles (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role    public.app_role not null,
  CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────
-- 3. has_role() function
-- ─────────────────────────────────────────────────────────────────────
-- Live definition (verified via pg_get_functiondef):
--   LANGUAGE sql  STABLE  SECURITY DEFINER  SET search_path TO 'public'
--   Args: _user_id uuid (first), _role app_role (second)
-- The generated TypeScript types list args alphabetically (_role, _user_id)
-- but positional call order in RLS is: has_role(auth.uid(), 'admin'::app_role)
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

-- ─────────────────────────────────────────────────────────────────────
-- 4. user_roles RLS policies
-- ─────────────────────────────────────────────────────────────────────
-- Live policies (verified via pg_policies):
--   "Admins can read all roles"  SELECT  authenticated  has_role(auth.uid(),'admin')
--   "Users can read own role"    SELECT  authenticated  user_id = auth.uid()
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role"   ON public.user_roles;

CREATE POLICY "Admins can read all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users can read own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 5. collections RLS policies
-- ─────────────────────────────────────────────────────────────────────
-- collections table created in migration 025 with RLS intentionally
-- disabled (pending this pass). Live DB has RLS enabled and two policies.
--
-- Live policies (verified via pg_policies):
--   "Admins full access collections"  ALL  has_role(auth.uid(),'admin')
--   "CMs manage own collections"      ALL  cm_id = auth.uid()
--
-- Also drop the old migration-012 policies that may exist on fresh
-- installs (migration 012 used is_admin()/is_content_manager()-based
-- policies; live DB replaced them with has_role()-based policies).

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

-- Drop migration-012 legacy policies (exist on fresh installs, absent live)
DROP POLICY IF EXISTS "Admins and CMs can view collections" ON public.collections;
DROP POLICY IF EXISTS "Admins can manage collections"       ON public.collections;

-- Drop live policy names (idempotent reset before recreating)
DROP POLICY IF EXISTS "Admins full access collections" ON public.collections;
DROP POLICY IF EXISTS "CMs manage own collections"     ON public.collections;

CREATE POLICY "Admins full access collections"
  ON public.collections FOR ALL
  USING      (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "CMs manage own collections"
  ON public.collections FOR ALL
  USING (cm_id = auth.uid());
