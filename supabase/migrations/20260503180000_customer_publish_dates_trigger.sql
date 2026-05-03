-- Task #16: keep customer_profiles.last_published_at and
-- latest_planned_publish_date in sync with customer_concepts whenever
-- a row is inserted, updated or deleted. The admin /customers list
-- selects these columns directly off the customer row (rather than the
-- v_customer_buffer view), so without an ongoing maintenance hook the
-- backfilled values from migration 20260503120000 will go stale.
--
-- Strategy: a single AFTER trigger on customer_concepts that, for every
-- affected customer_profile_id (NEW.customer_profile_id and, on
-- UPDATE/DELETE, OLD.customer_profile_id when different), recomputes
-- the per-customer MAX(published_at) / MAX(planned_publish_at) and
-- writes the result back. Recompute (rather than incremental MAX) keeps
-- the trigger correct under DELETE and date-decreasing UPDATEs.
--
-- Idempotent: safe to re-run. Backfill is preserved — the recompute
-- below yields the same values the migration produced for any customer
-- whose concept set hasn't changed since.

BEGIN;

CREATE OR REPLACE FUNCTION public._sync_customer_publish_dates(p_customer_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.customer_profiles cp
  SET last_published_at           = agg.last_published_at,
      latest_planned_publish_date = agg.latest_planned_publish_date
  FROM (
    SELECT MAX(published_at)       AS last_published_at,
           MAX(planned_publish_at) AS latest_planned_publish_date
    FROM public.customer_concepts
    WHERE customer_profile_id = p_customer_id
  ) agg
  WHERE cp.id = p_customer_id;
$$;

CREATE OR REPLACE FUNCTION public._customer_concepts_publish_dates_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.customer_profile_id IS NOT NULL THEN
      PERFORM public._sync_customer_publish_dates(NEW.customer_profile_id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.customer_profile_id IS NOT NULL THEN
      PERFORM public._sync_customer_publish_dates(NEW.customer_profile_id);
    END IF;
    IF OLD.customer_profile_id IS NOT NULL
       AND OLD.customer_profile_id IS DISTINCT FROM NEW.customer_profile_id THEN
      PERFORM public._sync_customer_publish_dates(OLD.customer_profile_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.customer_profile_id IS NOT NULL THEN
      PERFORM public._sync_customer_publish_dates(OLD.customer_profile_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS customer_concepts_publish_dates_sync
  ON public.customer_concepts;

-- Fire only when the columns we care about (or the parent FK) change,
-- so unrelated edits to customer_concepts (rating notes, etc.) don't
-- pay for the recompute.
CREATE TRIGGER customer_concepts_publish_dates_sync
AFTER INSERT OR DELETE OR UPDATE OF published_at, planned_publish_at, customer_profile_id
ON public.customer_concepts
FOR EACH ROW
EXECUTE FUNCTION public._customer_concepts_publish_dates_trigger();

-- One-shot reconcile so any drift since migration 20260503120000 is
-- corrected on apply. Same shape as the original backfill but writes
-- unconditionally (no COALESCE-against-existing) so a stale value gets
-- overwritten.
WITH agg AS (
  SELECT customer_profile_id,
         MAX(published_at)       AS last_published_at,
         MAX(planned_publish_at) AS latest_planned_publish_date
  FROM public.customer_concepts
  WHERE customer_profile_id IS NOT NULL
  GROUP BY customer_profile_id
)
UPDATE public.customer_profiles cp
SET last_published_at           = agg.last_published_at,
    latest_planned_publish_date = agg.latest_planned_publish_date
FROM agg
WHERE cp.id = agg.customer_profile_id
  AND (cp.last_published_at IS DISTINCT FROM agg.last_published_at
    OR cp.latest_planned_publish_date IS DISTINCT FROM agg.latest_planned_publish_date);

COMMIT;
