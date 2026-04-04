-- =====================================================================
-- Migration 024: Capture canonical CHECK constraints for customer_concepts
-- =====================================================================
-- Purpose: Capture CHECK constraints that exist in the live DB but are
-- absent from migration history (added out-of-band).
--
-- Constraints captured:
--
--   1. customer_concepts_status_check
--      Live definition: CHECK (status = ANY (ARRAY['draft','sent','produced','archived']))
--      History state:   Migration 007 defined CHECK (status IN ('active','paused','completed'))
--                       which was later relaxed/replaced in the live DB out-of-band.
--
--   2. customer_concepts_feed_slot_check
--      Live definition: CHECK ((feed_slot >= 1) AND (feed_slot <= 9))
--      History state:   Not present in any prior migration file.
--                       feed_slot column itself was captured in migration 023.
--
-- Verification that confirmed it was safe to apply:
--   Gate query run against live DB (2026-04-03):
--     SELECT status, COUNT(*) FROM customer_concepts
--     WHERE status IN ('active', 'paused', 'completed') GROUP BY status;
--   Result: 0 rows — all 31 rows have status 'draft'.
--
-- Idempotency approach: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.
-- On the live DB this briefly removes then re-adds the existing constraints
-- (safe — data is clean and matches both constraint definitions).
-- On a fresh install from db reset, no constraint exists to drop, so the
-- DROP is a no-op and ADD applies cleanly.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. Status CHECK constraint — canonical workflow status values
-- ─────────────────────────────────────────────────────────────────────

-- Drop old constraint if present (covers fresh installs replaying migration 007,
-- which created CHECK (status IN ('active','paused','completed')))
alter table public.customer_concepts
  drop constraint if exists customer_concepts_status_check;

alter table public.customer_concepts
  add constraint customer_concepts_status_check
    check (status in ('draft', 'sent', 'produced', 'archived'));

-- ─────────────────────────────────────────────────────────────────────
-- 2. feed_slot CHECK constraint — range guard on deprecated column
-- ─────────────────────────────────────────────────────────────────────
-- Note: feed_slot is @deprecated (see database.gen.ts, studio-v2.ts).
-- This constraint is captured for migration history parity only.
-- No new code writes to feed_slot; this is a pass-through capture.

alter table public.customer_concepts
  drop constraint if exists customer_concepts_feed_slot_check;

alter table public.customer_concepts
  add constraint customer_concepts_feed_slot_check
    check (feed_slot >= 1 and feed_slot <= 9);
