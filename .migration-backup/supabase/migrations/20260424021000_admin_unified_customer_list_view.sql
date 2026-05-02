-- Migration: Unified Customer List View
-- Purpose: Combine profile data with buffer/signals data to avoid sequential waterfalls in the UI.

BEGIN;

CREATE OR REPLACE VIEW public.v_admin_customer_list
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
    SELECT max(tp.published_at)
    FROM public.tiktok_publications tp
    WHERE tp.customer_id = c.id
  ) AS last_published_at
FROM public.customer_profiles c;

COMMIT;
