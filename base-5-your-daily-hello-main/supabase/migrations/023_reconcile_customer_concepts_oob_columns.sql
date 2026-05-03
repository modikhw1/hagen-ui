-- =====================================================================
-- Migration 023: Reconcile customer_concepts OOB columns
-- =====================================================================
-- Purpose: Capture customer_concepts columns that exist in the live DB
-- but are absent from migration history (added out-of-band to Supabase).
--
-- Evidence: app/src/types/database.gen.ts (generated from live schema)
-- shows all these columns present. Migration 007 created the baseline.
-- Migrations 019 and 022 added further incremental changes. The columns
-- below were added to the live DB directly and never captured in a file.
--
-- ALL ALTER TABLE statements use ADD COLUMN IF NOT EXISTS — fully
-- idempotent. This migration is a no-op on the live DB; its value is
-- ensuring supabase db reset and fresh-environment provisioning reproduce
-- the correct schema from migration history alone.
--
-- Scope: Phase 1A only (OOB column reconciliation).
-- Phase 1C (status CHECK constraint capture) is intentionally deferred —
-- it requires confirming no legacy status rows ('active','paused','completed')
-- exist before the new CHECK can be added safely. See the deferred section
-- at the end of this file for the exact gate and query.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- OOB columns: assignment / workflow boundary
-- ─────────────────────────────────────────────────────────────────────

alter table public.customer_concepts
  -- CM who created the assignment
  add column if not exists cm_id       uuid references public.profiles(id) on delete set null,
  -- Canonical assignment note (supersedes legacy 'notes' column; dual-written via PATCH route)
  add column if not exists cm_note     text,
  -- Share marker: set when the concept is first emailed to the customer
  add column if not exists sent_at     timestamptz,
  -- Result marker: set when the concept is marked as filmed/produced
  add column if not exists produced_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────
-- OOB columns: content boundary
-- ─────────────────────────────────────────────────────────────────────

alter table public.customer_concepts
  -- JSONB store for all content overrides; dual-written alongside legacy mirror columns
  -- (custom_headline, custom_description, etc.) which exist from migration 007.
  -- content_overrides is the canonical read path; legacy mirrors are fallback + compat.
  add column if not exists content_overrides    jsonb default '{}'::jsonb,
  -- Content override mirror columns that were added OOB (parallel to the migration-007
  -- columns custom_why_it_works and custom_instructions which they partially supersede)
  add column if not exists why_it_fits          text,
  add column if not exists filming_instructions text;

-- ─────────────────────────────────────────────────────────────────────
-- OOB columns: placement boundary
-- ─────────────────────────────────────────────────────────────────────

alter table public.customer_concepts
  -- 0-centered integer: >0=upcoming, 0=current, <0=history, null=not in plan.
  -- Used by feed, slot planner, and mark-produced (sets to null).
  add column if not exists feed_order integer,
  -- @deprecated — kept for backwards compatibility; no active writes.
  -- Superseded by feed_order. Safe to drop once all reads are removed.
  add column if not exists feed_slot  integer;

-- ─────────────────────────────────────────────────────────────────────
-- OOB columns: markers boundary
-- ─────────────────────────────────────────────────────────────────────

alter table public.customer_concepts
  -- Array of tag names; written by PATCH route
  add column if not exists tags          text[] default '{}'::text[],
  -- Optional grouping / collection reference
  add column if not exists collection_id text;

-- ─────────────────────────────────────────────────────────────────────
-- OOB columns: result boundary
-- ─────────────────────────────────────────────────────────────────────

alter table public.customer_concepts
  -- TikTok URL for the published clip; set by mark-produced route
  add column if not exists tiktok_url text;

-- ─────────────────────────────────────────────────────────────────────
-- OOB columns: identity / compat
-- ─────────────────────────────────────────────────────────────────────

alter table public.customer_concepts
  -- Compat alias for customer_profile_id. Both are written with the same
  -- value on insert (buildAssignmentInsertPayload). Canonical read uses
  -- customer_profile_id; normalizeStudioCustomerConcept reads customer_id
  -- first as a fallback. No FK to keep the column simple for compat reads.
  add column if not exists customer_id uuid;

-- ─────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────

-- General feed ordering index (non-partial).
-- Migration 019 already created a partial index for WHERE concept_id IS NULL;
-- this index supports the broader feed queries that don't filter on concept_id.
create index if not exists idx_customer_concepts_feed_order_general
  on public.customer_concepts(customer_profile_id, feed_order);

-- ─────────────────────────────────────────────────────────────────────
-- DEFERRED: Phase 1C — status CHECK constraint
-- ─────────────────────────────────────────────────────────────────────
-- The original CHECK from migration 007 was:
--   CHECK (status IN ('active', 'paused', 'completed'))
-- This was already removed from the live DB out-of-band. The canonical
-- values are now: 'draft', 'sent', 'produced', 'archived'.
--
-- Phase 1C is deferred because adding the new CHECK requires confirming
-- that no rows still carry the legacy status values. Without DB access
-- to run the pre-flight query, inclusion here risks a migration failure
-- if legacy rows exist.
--
-- Gate query (run in Supabase SQL Editor before adding this):
--   SELECT status, COUNT(*) FROM customer_concepts
--   WHERE status IN ('active', 'paused', 'completed')
--   GROUP BY status;
--   -- Must return 0 rows.
--
-- If zero rows: append the following to this migration or a new 024:
--
--   alter table public.customer_concepts
--     drop constraint if exists customer_concepts_status_check;
--   alter table public.customer_concepts
--     add constraint customer_concepts_status_check
--       check (status in ('draft', 'sent', 'produced', 'archived'));
--
-- If non-zero rows: run Phase 1B backfill first (see reconciliation plan),
-- then add the CHECK.
-- ─────────────────────────────────────────────────────────────────────
