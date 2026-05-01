-- Migration: Add overdue_concepts_count and refine planned_concepts_count
-- Purpose: Support accurate tempo calculation (x/y) by distinguishing between fresh and stale plans.

BEGIN;

DROP VIEW IF EXISTS public.v_admin_customer_list;

CREATE VIEW public.v_admin_customer_list
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.business_name,
  c.contact_email,
  c.customer_contact_name,
  c.account_manager,
  c.account_manager_profile_id,
  c.monthly_price,
  c.pricing_status,
  c.status,
  c.created_at,
  c.agreed_at,
  c.paused_until,
  c.onboarding_state,
  c.onboarding_state_changed_at,
  c.concepts_per_week,
  c.expected_concepts_per_week,
  c.tiktok_handle,
  c.invited_at,
  (
    SELECT max(fc.planned_publish_date)
    FROM public.feedplan_concepts fc
    WHERE fc.customer_id = c.id
      AND fc.status IN ('draft', 'ready')
  ) AS latest_planned_publish_date,
  (
    -- Only count concepts planned for the future or today as "planned" for the pulse
    SELECT count(*)
    FROM public.feedplan_concepts fc
    WHERE fc.customer_id = c.id
      AND fc.status IN ('draft', 'ready')
      AND (fc.planned_publish_date >= CURRENT_DATE OR fc.planned_publish_date IS NULL)
  ) AS planned_concepts_count,
  (
    -- Count concepts that have passed their planned date without being published
    SELECT count(*)
    FROM public.feedplan_concepts fc
    WHERE fc.customer_id = c.id
      AND fc.status IN ('draft', 'ready')
      AND fc.planned_publish_date < CURRENT_DATE
  ) AS overdue_concepts_count,
  (
    SELECT max(tp.published_at)
    FROM public.tiktok_publications tp
    WHERE tp.customer_id = c.id
  ) AS last_published_at,
  (
    SELECT ca.scheduled_change
    FROM public.cm_assignments ca
    WHERE ca.customer_id = c.id
      AND ca.valid_to IS NULL
      AND ca.scheduled_change IS NOT NULL
    LIMIT 1
  ) AS scheduled_cm_change
FROM public.customer_profiles c;

COMMIT;
