-- =====================================================================
-- Migration 025: Reconcile customer_concepts FK constraints
-- =====================================================================
-- Purpose: Capture FK constraints on customer_concepts that exist in the
-- live DB but are absent from (or incorrect in) migration history.
--
-- Context: Migration 023 added OOB columns but omitted FK constraints for
-- cm_id, customer_id, and collection_id. It also:
--   - declared cm_id with ON DELETE SET NULL (live DB has NO ACTION)
--   - declared customer_id without a FK (live DB has ON DELETE CASCADE)
--   - declared collection_id as TEXT (live DB has UUID) and without a FK
--
-- The collections table is entirely OOB. It must be created here before
-- the collection_id FK can reference it on fresh installs.
--
-- Scope: FK/schema reconciliation only.
-- Intentionally excluded:
--   - RLS policies on collections (depend on OOB RBAC objects: has_role(),
--     user_roles table, app_role enum type — separate reconciliation pass)
--   - customer_id NOT NULL constraint (present live, absent in migration 023;
--     separate from FK scope — noting for a future cleanup pass)
--   - Any data backfills
--
-- All statements are idempotent:
--   - CREATE TABLE IF NOT EXISTS: no-op on live DB
--   - DO $$ IF EXISTS: conditional ALTER TYPE only runs on fresh installs
--   - DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT: safe drop-and-re-add
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. Create collections table (prerequisite for collection_id FK)
-- ─────────────────────────────────────────────────────────────────────
-- Live schema (from database.gen.ts + pg_constraint verification):
--   id: UUID PK, cm_id: UUID NOT NULL FK→profiles(id) ON DELETE CASCADE,
--   name: TEXT NOT NULL, color: TEXT NOT NULL, created_at: TIMESTAMPTZ
--
-- RLS is intentionally NOT enabled here. The live DB uses has_role() /
-- user_roles / app_role (all OOB) for RLS. That is deferred to the OOB
-- objects reconciliation pass. Fresh installs will have no RLS on this
-- table until that pass runs.

create table if not exists public.collections (
  id         uuid primary key default gen_random_uuid(),
  cm_id      uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  color      text not null,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Fix collection_id column type: TEXT → UUID
-- ─────────────────────────────────────────────────────────────────────
-- Migration 023 declared: add column if not exists collection_id text
-- Live DB has: collection_id uuid (nullable)
-- On a fresh install (db reset), migration 023 creates collection_id as
-- TEXT. A FK to collections(id) (which is UUID) would then fail unless
-- the column type is corrected first.
--
-- The DO block is conditional so this no-ops on the live DB (where
-- collection_id is already UUID) without taking an AccessExclusiveLock.
-- On fresh installs all collection_id values are NULL so the USING
-- cast is safe.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'customer_concepts'
      and column_name  = 'collection_id'
      and data_type    = 'text'
  ) then
    alter table public.customer_concepts
      alter column collection_id type uuid using collection_id::uuid;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Correct cm_id FK: SET NULL → NO ACTION (live parity)
-- ─────────────────────────────────────────────────────────────────────
-- Migration 023 added: cm_id uuid references profiles(id) on delete set null
-- Live DB has: FOREIGN KEY (cm_id) REFERENCES profiles(id)
--              (no ON DELETE clause = NO ACTION, implicit default)
--
-- On a fresh install, migration 023 creates the FK with SET NULL behavior.
-- This migration corrects it to NO ACTION to match the live DB.
-- On the live DB: drops and re-adds the existing NO ACTION FK (behavioral no-op).

alter table public.customer_concepts
  drop constraint if exists customer_concepts_cm_id_fkey;

alter table public.customer_concepts
  add constraint customer_concepts_cm_id_fkey
    foreign key (cm_id) references public.profiles(id);
    -- No ON DELETE clause = NO ACTION (matches live DB behavior)

-- ─────────────────────────────────────────────────────────────────────
-- 4. Add customer_id FK (missing from migration history)
-- ─────────────────────────────────────────────────────────────────────
-- Live DB has: FOREIGN KEY (customer_id) REFERENCES customer_profiles(id)
--              ON DELETE CASCADE
-- Migration 023 added the column (uuid) with no FK declared.
--
-- Note: live DB also has customer_id as NOT NULL. Migration 023 added it
-- as nullable. This NOT NULL discrepancy is noted but out of FK scope;
-- a future cleanup pass can address it.

alter table public.customer_concepts
  drop constraint if exists customer_concepts_customer_id_fkey;

alter table public.customer_concepts
  add constraint customer_concepts_customer_id_fkey
    foreign key (customer_id) references public.customer_profiles(id) on delete cascade;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Add collection_id FK (missing from migration history)
-- ─────────────────────────────────────────────────────────────────────
-- Live DB has: FOREIGN KEY (collection_id) REFERENCES collections(id)
--              (no ON DELETE clause = NO ACTION)
-- Migration 023 added the column (incorrectly as TEXT, corrected in step 2).
-- The collections table is now guaranteed to exist (created in step 1).

alter table public.customer_concepts
  drop constraint if exists fk_customer_concepts_collection;

alter table public.customer_concepts
  add constraint fk_customer_concepts_collection
    foreign key (collection_id) references public.collections(id);
    -- No ON DELETE clause = NO ACTION (matches live DB behavior)
