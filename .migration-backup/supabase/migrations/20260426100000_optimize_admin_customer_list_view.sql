BEGIN;

DROP VIEW IF EXISTS public.v_admin_customer_list CASCADE;

CREATE OR REPLACE VIEW public.v_admin_customer_list
WITH (security_invoker = true) AS
WITH concept_stats AS (
  SELECT
    fc.customer_id,
    max(fc.planned_publish_at) AS latest_planned_publish_date,
    count(*) AS planned_concepts_count
  FROM public.customer_concepts fc
  WHERE fc.status IN ('draft', 'ready')
  GROUP BY fc.customer_id
),
publication_stats AS (
  SELECT
    tp.customer_id,
    max(tp.published_at) AS last_published_at
  FROM public.tiktok_publications tp
  GROUP BY tp.customer_id
),
assignment_stats AS (
  SELECT DISTINCT ON (ca.customer_id)
    ca.customer_id,
    ca.scheduled_change
  FROM public.cm_assignments ca
  WHERE ca.valid_to IS NULL
    AND ca.scheduled_change IS NOT NULL
  ORDER BY ca.customer_id, ca.valid_from DESC
)
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
  cs.latest_planned_publish_date,
  COALESCE(cs.planned_concepts_count, 0)::bigint AS planned_concepts_count,
  ps.last_published_at,
  ass.scheduled_change AS scheduled_cm_change
FROM public.customer_profiles c
LEFT JOIN concept_stats cs ON cs.customer_id = c.id
LEFT JOIN publication_stats ps ON ps.customer_id = c.id
LEFT JOIN assignment_stats ass ON ass.customer_id = c.id;

COMMENT ON VIEW public.v_admin_customer_list IS 'Optimized view for the main admin customer list. Pre-aggregates concept, publication and assignment data to avoid N+1 queries.';

END;
