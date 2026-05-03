-- Align customer_profiles schema with the columns the API/UI code already
-- selects, and rebuild v_customer_buffer to expose the columns the buffer
-- endpoint requires. Idempotent: safe to re-run.

BEGIN;

-- 1. Add missing columns referenced by admin/customers, overview and team
--    code paths. All nullable so existing rows stay valid.
ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS cm_avatar_url               text,
  ADD COLUMN IF NOT EXISTS cm_initial_color            text,
  ADD COLUMN IF NOT EXISTS derived_status              text,
  ADD COLUMN IF NOT EXISTS latest_planned_publish_date timestamptz,
  ADD COLUMN IF NOT EXISTS last_published_at           timestamptz,
  ADD COLUMN IF NOT EXISTS upcoming_price_change       jsonb;

-- 2. Backfill cm_avatar_url / cm_initial_color from the assigned CM.
--    account_manager_profile_id is a profiles.id; team_members.profile_id
--    points to the same profiles row.
UPDATE public.customer_profiles cp
SET cm_avatar_url    = COALESCE(cp.cm_avatar_url,    tm.avatar_url),
    cm_initial_color = COALESCE(cp.cm_initial_color, tm.color)
FROM public.team_members tm
WHERE cp.account_manager_profile_id IS NOT NULL
  AND tm.profile_id = cp.account_manager_profile_id;

-- 3. Seed derived_status from status (the API code falls back to status
--    anyway, so this is safe).
UPDATE public.customer_profiles
SET derived_status = status
WHERE derived_status IS NULL;

-- 4. Backfill last_published_at / latest_planned_publish_date from the
--    customer_concepts history.
WITH agg AS (
  SELECT customer_profile_id,
         MAX(published_at)       AS last_published_at,
         MAX(planned_publish_at) AS latest_planned_publish_date
  FROM public.customer_concepts
  WHERE customer_profile_id IS NOT NULL
  GROUP BY customer_profile_id
)
UPDATE public.customer_profiles cp
SET last_published_at           = COALESCE(cp.last_published_at,           agg.last_published_at),
    latest_planned_publish_date = COALESCE(cp.latest_planned_publish_date, agg.latest_planned_publish_date)
FROM agg
WHERE cp.id = agg.customer_profile_id;

-- 5. Recreate v_customer_buffer so it exposes the exact columns the
--    /api/admin/customers/buffer endpoint selects, computed live from
--    customer_concepts so it doesn't drift. Drop first because the
--    previous view typed latest_planned_publish_date as date and
--    Postgres rejects column-type changes via CREATE OR REPLACE VIEW.
DROP VIEW IF EXISTS public.v_customer_buffer;
CREATE VIEW public.v_customer_buffer AS
SELECT cp.id                          AS customer_id,
       cp.account_manager_profile_id  AS assigned_cm_id,
       cp.concepts_per_week,
       cp.paused_until,
       agg.latest_planned_publish_date,
       agg.last_published_at
FROM public.customer_profiles cp
LEFT JOIN (
  SELECT customer_profile_id,
         MAX(published_at)       AS last_published_at,
         MAX(planned_publish_at) AS latest_planned_publish_date
  FROM public.customer_concepts
  WHERE customer_profile_id IS NOT NULL
  GROUP BY customer_profile_id
) agg ON agg.customer_profile_id = cp.id;

COMMIT;
