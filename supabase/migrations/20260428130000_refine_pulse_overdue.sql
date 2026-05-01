-- Migration: Refine pulse counts for CM preparation vs Customer fulfillment
-- Purpose: Keep all planned concepts in the CM's "credit" (XY-bar) but flag "Waiting for Customer" only after a 7-day delay.

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
    -- CM's "credit" (XY Bar): Count ALL concepts they have put effort into planning
    SELECT count(*)
    FROM public.feedplan_concepts fc
    WHERE fc.customer_id = c.id
      AND fc.status IN ('draft', 'ready')
  ) AS planned_concepts_count,
  (
    -- "Waiting for Customer": Count concepts that have passed their date by more than 7 days
    SELECT count(*)
    FROM public.feedplan_concepts fc
    WHERE fc.customer_id = c.id
      AND fc.status IN ('draft', 'ready')
      AND fc.planned_publish_date < (CURRENT_DATE - INTERVAL '7 days')
  ) AS overdue_7d_concepts_count,
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
