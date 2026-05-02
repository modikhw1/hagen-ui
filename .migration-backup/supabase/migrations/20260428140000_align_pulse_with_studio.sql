-- Migration: Align pulse counts with actual Studio data (customer_concepts)
-- Purpose: Track CM's preparation and Customer fulfillment using the primary concept table.

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
    SELECT max(cc.planned_publish_at)::date
    FROM public.customer_concepts cc
    WHERE cc.customer_profile_id = c.id
      AND cc.status != 'archived'
      AND cc.published_at IS NULL
  ) AS latest_planned_publish_date,
  (
    -- CM's "credit" (XY Bar): Count ALL concepts they have prepared in the Studio
    SELECT count(*)
    FROM public.customer_concepts cc
    WHERE cc.customer_profile_id = c.id
      AND cc.status != 'archived'
      AND cc.published_at IS NULL
  ) AS planned_concepts_count,
  (
    -- "Waiting for Customer": Count concepts that have passed their date by more than 7 days without being produced
    SELECT count(*)
    FROM public.customer_concepts cc
    WHERE cc.customer_profile_id = c.id
      AND cc.status != 'archived'
      AND cc.published_at IS NULL
      AND cc.produced_at IS NULL
      AND cc.planned_publish_at < (CURRENT_DATE - INTERVAL '7 days')
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
