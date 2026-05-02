BEGIN;

DROP FUNCTION IF EXISTS public.admin_get_customer_list(text, text, text, integer, integer);
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
  tm.name AS cm_full_name,
  tm.avatar_url AS cm_avatar_url,
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
      AND cc.status <> 'archived'
      AND cc.published_at IS NULL
  ) AS latest_planned_publish_date,
  (
    SELECT count(*)
    FROM public.customer_concepts cc
    WHERE cc.customer_profile_id = c.id
      AND cc.status <> 'archived'
      AND cc.published_at IS NULL
  ) AS planned_concepts_count,
  (
    SELECT count(*)
    FROM public.customer_concepts cc
    WHERE cc.customer_profile_id = c.id
      AND cc.status <> 'archived'
      AND cc.published_at IS NULL
      AND cc.produced_at IS NULL
      AND cc.planned_publish_at < (CURRENT_DATE - '7 days'::interval)
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
FROM public.customer_profiles c
LEFT JOIN public.team_members tm
  ON tm.id = c.account_manager_profile_id;

COMMENT ON VIEW public.v_admin_customer_list IS
  'Admin customer list view with CM display fields restored for RPC search/sort compatibility.';

CREATE OR REPLACE FUNCTION public.admin_get_customer_list(
  p_search text DEFAULT '',
  p_filter text DEFAULT 'all',
  p_sort text DEFAULT 'recent',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_rows jsonb;
  v_search_pattern text;
BEGIN
  v_search_pattern := CASE
    WHEN p_search IS NOT NULL AND length(trim(p_search)) > 0
      THEN '%' || trim(p_search) || '%'
    ELSE NULL
  END;

  SELECT count(*)
    INTO v_total
  FROM public.v_admin_customer_list c
  WHERE
    ((p_filter = 'prospect' AND c.status = 'prospect') OR (p_filter != 'prospect' AND c.status != 'prospect'))
    AND (
      v_search_pattern IS NULL
      OR c.business_name ILIKE v_search_pattern
      OR c.contact_email ILIKE v_search_pattern
      OR c.cm_full_name ILIKE v_search_pattern
      OR c.customer_contact_name ILIKE v_search_pattern
    )
    AND CASE p_filter
      WHEN 'active' THEN c.status IN ('active', 'agreed')
      WHEN 'pending' THEN c.status IN ('invited', 'pending', 'pending_payment', 'pending_invoice', 'past_due')
      WHEN 'paused' THEN c.status = 'paused'
      WHEN 'archived' THEN c.status = 'archived'
      WHEN 'prospect' THEN c.status = 'prospect'
      ELSE TRUE
    END;

  SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT *
    FROM public.v_admin_customer_list c
    WHERE
      ((p_filter = 'prospect' AND c.status = 'prospect') OR (p_filter != 'prospect' AND c.status != 'prospect'))
      AND (
        v_search_pattern IS NULL
        OR c.business_name ILIKE v_search_pattern
        OR c.contact_email ILIKE v_search_pattern
        OR c.cm_full_name ILIKE v_search_pattern
        OR c.customer_contact_name ILIKE v_search_pattern
      )
      AND CASE p_filter
        WHEN 'active' THEN c.status IN ('active', 'agreed')
        WHEN 'pending' THEN c.status IN ('invited', 'pending', 'pending_payment', 'pending_invoice', 'past_due')
        WHEN 'paused' THEN c.status = 'paused'
        WHEN 'archived' THEN c.status = 'archived'
        WHEN 'prospect' THEN c.status = 'prospect'
        ELSE TRUE
      END
    ORDER BY
      CASE WHEN p_sort = 'recent' THEN c.created_at END DESC NULLS LAST,
      CASE WHEN p_sort IN ('name_asc', 'alphabetical') THEN c.business_name END ASC NULLS LAST,
      CASE WHEN p_sort = 'name_desc' THEN c.business_name END DESC NULLS LAST,
      CASE WHEN p_sort = 'cm_asc' THEN c.cm_full_name END ASC NULLS LAST,
      CASE WHEN p_sort = 'cm_desc' THEN c.cm_full_name END DESC NULLS LAST,
      CASE WHEN p_sort = 'price_asc' THEN c.monthly_price END ASC NULLS LAST,
      CASE WHEN p_sort = 'price_desc' THEN c.monthly_price END DESC NULLS LAST,
      CASE WHEN p_sort = 'status_asc' THEN c.status END ASC NULLS LAST,
      CASE WHEN p_sort = 'status_desc' THEN c.status END DESC NULLS LAST,
      c.created_at DESC
    OFFSET p_offset
    LIMIT p_limit
  ) c;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_customer_list(text, text, text, integer, integer)
  TO authenticated, service_role;

COMMIT;
