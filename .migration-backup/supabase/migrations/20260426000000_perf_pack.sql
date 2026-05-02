-- supabase/migrations/20260426_perf_pack.sql
BEGIN;

-- ============================================================================
-- 1. INDEX-PAKET (täcker alla kända query-mönster i loaders)
-- ============================================================================

-- Krävs för trigram-index nedan
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- customer_profiles: stöder list-view filtrering + sort
CREATE INDEX IF NOT EXISTS idx_customer_profiles_status_created_at
  ON public.customer_profiles (status, created_at DESC)
  WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS idx_customer_profiles_business_name_trgm
  ON public.customer_profiles USING gin (business_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_contact_email_trgm
  ON public.customer_profiles USING gin (contact_email gin_trgm_ops);

-- cm_activities: stoppar full table scan när team-loadern hämtar 90d
CREATE INDEX IF NOT EXISTS idx_cm_activities_cm_id_created_at_desc
  ON public.cm_activities (cm_id, created_at DESC);

-- cm_assignments: aktiv coverage-lookup
CREATE INDEX IF NOT EXISTS idx_cm_assignments_cm_id_active
  ON public.cm_assignments (cm_id)
  WHERE valid_to IS NULL;

-- tiktok_stats: 7-dagars rollup per customer
CREATE INDEX IF NOT EXISTS idx_tiktok_stats_customer_snapshot
  ON public.tiktok_stats (customer_profile_id, snapshot_date DESC);

-- invoices: per-customer historik (ersätter sekventiell query i loadCustomerInvoicesSnapshot)
CREATE INDEX IF NOT EXISTS idx_invoices_customer_profile_created_desc
  ON public.invoices (customer_profile_id, created_at DESC);

-- invoice_line_items: snabb IN(...) lookup
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_stripe_invoice
  ON public.invoice_line_items (stripe_invoice_id);

-- attention_snoozes: aktiv subset
CREATE INDEX IF NOT EXISTS idx_attention_snoozes_subject_active_v2
  ON public.attention_snoozes (subject_type, subject_id)
  WHERE released_at IS NULL;

-- subscriptions: lookup per customer
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_profile
  ON public.subscriptions (customer_profile_id, created DESC);

-- ============================================================================
-- 2. ADMIN_TEAM_OVERVIEW: skriv om med tidsbegränsad activity rollup
-- ============================================================================
-- Tidigare version aggregerade ALL cm_activities-historik utan WHERE.
-- Nu: 90 dagars fönster i CTE, vilket möjliggör index-skanning.

DROP VIEW IF EXISTS public.admin_team_overview CASCADE;

CREATE OR REPLACE VIEW public.admin_team_overview AS
WITH active_assignments AS (
  SELECT
    ca.cm_id,
    cp.id AS customer_id,
    cp.status,
    cp.monthly_price,
    cp.paused_until
  FROM public.cm_assignments ca
  JOIN public.customer_profiles cp ON cp.id = ca.customer_id
  WHERE ca.valid_to IS NULL
    AND COALESCE(cp.status, '') <> 'archived'
),
customer_rollup AS (
  SELECT
    cm_id,
    count(*)::int AS customer_count,
    COALESCE(
      sum(
        CASE
          WHEN COALESCE(status, '') IN ('active', 'agreed', 'pending_invoice', 'pending_payment')
            AND paused_until IS NULL
            THEN COALESCE(monthly_price, 0)::bigint * 100
          ELSE 0
        END
      ),
      0
    )::bigint AS mrr_ore
  FROM active_assignments
  GROUP BY cm_id
),
activity_rollup AS (
  -- KRITISKT: WHERE-filter innan group by; använder nytt index
  SELECT
    cm_id,
    count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS activity_events_30d,
    count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS activity_events_7d
  FROM public.cm_activities
  WHERE created_at >= now() - interval '90 days'
  GROUP BY cm_id
),
active_absence AS (
  SELECT DISTINCT ON (a.cm_id)
    a.id AS absence_id,
    a.cm_id,
    a.backup_cm_id,
    a.absence_type,
    a.compensation_mode,
    a.starts_on,
    a.ends_on,
    a.note
  FROM public.cm_absences a
  WHERE a.customer_profile_id IS NULL
    AND current_date BETWEEN a.starts_on AND a.ends_on
  ORDER BY a.cm_id, a.starts_on DESC, a.created_at DESC
)
SELECT
  tm.id,
  tm.profile_id,
  tm.name,
  tm.email,
  tm.phone,
  COALESCE(tm.role, 'content_manager') AS role,
  tm.avatar_url,
  tm.bio,
  tm.region AS city,
  COALESCE(tm.is_active, true) AS is_active,
  COALESCE(tm.commission_rate, 0.2) AS commission_rate,
  COALESCE(cr.customer_count, 0) AS customer_count,
  COALESCE(cr.mrr_ore, 0) AS mrr_ore,
  CASE
    WHEN COALESCE(cr.customer_count, 0) <= 4 THEN 'ok'
    WHEN COALESCE(cr.customer_count, 0) <= 7 THEN 'warn'
    ELSE 'overload'
  END AS customer_load_level,
  CASE
    WHEN COALESCE(cr.customer_count, 0) >= 11 THEN 'Overbelastad'
    WHEN COALESCE(cr.customer_count, 0) >= 8 THEN 'Full portfolj'
    WHEN COALESCE(cr.customer_count, 0) >= 5 THEN 'Balans'
    ELSE 'Latt portfolj'
  END AS customer_load_label,
  (COALESCE(cr.customer_count, 0) >= 11) AS overloaded,
  COALESCE(ar.activity_events_30d, 0) AS activity_events_30d,
  COALESCE(ar.activity_events_7d, 0) AS activity_events_7d,
  aa.absence_id AS active_absence_id,
  aa.backup_cm_id AS active_absence_backup_cm_id,
  aa.absence_type AS active_absence_type,
  aa.compensation_mode AS active_absence_compensation_mode,
  aa.starts_on AS active_absence_starts_on,
  aa.ends_on AS active_absence_ends_on,
  aa.note AS active_absence_note
FROM public.team_members tm
LEFT JOIN customer_rollup cr ON cr.cm_id = tm.id
LEFT JOIN activity_rollup ar ON ar.cm_id = tm.id
LEFT JOIN active_absence aa ON aa.cm_id = tm.id
WHERE COALESCE(tm.is_active, true) = true;

-- ============================================================================
-- 3. RPC: admin_get_team_overview — ersätter 6 queries med 1 rundresa
-- ============================================================================
-- Returnerar allt som loadTeamOverview behöver: members + active_absences +
-- per-customer info + 14 dagars dot-historik + assignment scheduling.
-- Detta tar bort 90% av latensen på /team.

CREATE OR REPLACE FUNCTION public.admin_get_team_overview(
  p_sort_mode text DEFAULT 'standard'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH members AS (
    SELECT * FROM public.admin_team_overview
  ),
  customers_with_assignment AS (
    SELECT
      ca.cm_id,
      cp.id,
      cp.business_name,
      cp.monthly_price,
      cp.status,
      cp.paused_until,
      cp.account_manager_profile_id,
      cp.account_manager,
      cp.last_upload_at
    FROM public.cm_assignments ca
    JOIN public.customer_profiles cp ON cp.id = ca.customer_id
    WHERE ca.valid_to IS NULL
      AND COALESCE(cp.status, '') <> 'archived'
  ),
  customers_per_cm AS (
    SELECT
      cm_id,
      jsonb_agg(jsonb_build_object(
        'id', id,
        'business_name', business_name,
        'monthly_price', monthly_price,
        'status', status,
        'paused_until', paused_until,
        'last_upload_at', last_upload_at
      ) ORDER BY business_name) AS customers
    FROM customers_with_assignment
    GROUP BY cm_id
  ),
  -- 14-dagars activity dots per cm (server-side; ingen JS-loop)
  activity_dots AS (
    SELECT
      cm_id,
      jsonb_agg(jsonb_build_object(
        'date', day::date,
        'count', cnt
      ) ORDER BY day) AS dots
    FROM (
      SELECT
        a.cm_id AS cm_id,
        date_trunc('day', a.created_at) AS day,
        count(*) AS cnt
      FROM public.cm_activities a
      WHERE a.created_at >= current_date - interval '14 days'
      GROUP BY 1, 2
    ) sub
    WHERE cm_id IS NOT NULL
    GROUP BY cm_id
  ),
  active_absences AS (
    SELECT
      a.cm_id,
      jsonb_agg(jsonb_build_object(
        'id', a.id,
        'cm_id', a.cm_id,
        'backup_cm_id', a.backup_cm_id,
        'absence_type', a.absence_type,
        'compensation_mode', a.compensation_mode,
        'starts_on', a.starts_on,
        'ends_on', a.ends_on,
        'note', a.note,
        'customer_profile_id', a.customer_profile_id
      ) ORDER BY a.starts_on DESC) AS absences
    FROM public.cm_absences a
    WHERE current_date BETWEEN a.starts_on AND a.ends_on
    GROUP BY a.cm_id
  )
  SELECT jsonb_build_object(
    'as_of_date', current_date::text,
    'sort_mode', p_sort_mode,
    'members', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'profile_id', m.profile_id,
        'name', m.name,
        'email', m.email,
        'phone', m.phone,
        'role', m.role,
        'avatar_url', m.avatar_url,
        'bio', m.bio,
        'city', m.city,
        'is_active', m.is_active,
        'commission_rate', m.commission_rate,
        'customer_count', m.customer_count,
        'mrr_ore', m.mrr_ore,
        'customer_load_level', m.customer_load_level,
        'customer_load_label', m.customer_load_label,
        'overloaded', m.overloaded,
        'activity_events_30d', m.activity_events_30d,
        'activity_events_7d', m.activity_events_7d,
        'active_absence', CASE
          WHEN m.active_absence_id IS NOT NULL THEN jsonb_build_object(
            'id', m.active_absence_id,
            'backup_cm_id', m.active_absence_backup_cm_id,
            'absence_type', m.active_absence_type,
            'compensation_mode', m.active_absence_compensation_mode,
            'starts_on', m.active_absence_starts_on,
            'ends_on', m.active_absence_ends_on,
            'note', m.active_absence_note
          )
          ELSE NULL
        END,
        'customers', COALESCE(cpc.customers, '[]'::jsonb),
        'activity_dots', COALESCE(ad.dots, '[]'::jsonb),
        'absences', COALESCE(aa.absences, '[]'::jsonb)
      )
      ORDER BY
        CASE WHEN p_sort_mode = 'anomalous' THEN m.activity_events_7d ELSE 0 END ASC,
        m.name ASC
    ), '[]'::jsonb)
  )
  FROM members m
  LEFT JOIN customers_per_cm cpc ON cpc.cm_id = m.id
  LEFT JOIN activity_dots ad ON ad.cm_id = m.id
  LEFT JOIN active_absences aa ON aa.cm_id = m.id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_team_overview(text) TO authenticated, service_role;

-- ============================================================================
-- 4. RPC: admin_get_customer_list — ersätter loadAdminCustomersSnapshot
-- ============================================================================
-- Ersätter två separata queries (count + rows) + JS-side derive med en RPC.

CREATE OR REPLACE FUNCTION public.admin_get_customer_list(
  p_search text DEFAULT '',
  p_filter text DEFAULT 'all',
  p_sort text DEFAULT 'recent',
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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

  -- COUNT (samma WHERE som rows-query)
  SELECT count(*)
    INTO v_total
  FROM public.v_admin_customer_list c
  WHERE
    (v_search_pattern IS NULL OR c.business_name ILIKE v_search_pattern OR c.contact_email ILIKE v_search_pattern)
    AND CASE p_filter
      WHEN 'active' THEN c.status IN ('active', 'agreed', 'paused', 'past_due')
      WHEN 'pipeline' THEN c.status IN ('invited', 'pending', 'pending_payment', 'pending_invoice')
      WHEN 'archived' THEN c.status = 'archived'
      ELSE TRUE
    END;

  -- ROWS
  SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT *
    FROM public.v_admin_customer_list c
    WHERE
      (v_search_pattern IS NULL OR c.business_name ILIKE v_search_pattern OR c.contact_email ILIKE v_search_pattern)
      AND CASE p_filter
        WHEN 'active' THEN c.status IN ('active', 'agreed', 'paused', 'past_due')
        WHEN 'pipeline' THEN c.status IN ('invited', 'pending', 'pending_payment', 'pending_invoice')
        WHEN 'archived' THEN c.status = 'archived'
        ELSE TRUE
      END
    ORDER BY
      CASE WHEN p_sort IN ('recent', 'newest') THEN c.created_at END DESC NULLS LAST,
      CASE WHEN p_sort = 'oldest' THEN c.created_at END ASC NULLS LAST,
      CASE WHEN p_sort IN ('name_asc', 'alphabetical') THEN c.business_name END ASC NULLS LAST,
      CASE WHEN p_sort = 'name_desc' THEN c.business_name END DESC NULLS LAST,
      CASE WHEN p_sort = 'cm_asc' THEN c.account_manager END ASC NULLS LAST,
      CASE WHEN p_sort = 'cm_desc' THEN c.account_manager END DESC NULLS LAST,
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

GRANT EXECUTE ON FUNCTION public.admin_get_customer_list(text, text, text, int, int)
  TO authenticated, service_role;

-- ============================================================================
-- 5. RPC: admin_get_customer_invoices_with_lines — slår ihop 2 queries
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_customer_invoices_with_lines(
  p_customer_id uuid,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH inv AS (
    SELECT
      i.id,
      i.stripe_invoice_id,
      i.amount_due,
      i.status,
      i.created_at,
      i.due_date,
      i.hosted_invoice_url
    FROM public.invoices i
    WHERE i.customer_profile_id = p_customer_id
    ORDER BY i.created_at DESC
    LIMIT p_limit
  ),
  lines AS (
    SELECT
      l.stripe_invoice_id,
      jsonb_agg(jsonb_build_object(
        'description', COALESCE(l.description, 'Rad'),
        'amount', COALESCE(l.amount, 0)
      ) ORDER BY l.id) AS items
    FROM public.invoice_line_items l
    WHERE l.stripe_invoice_id IN (SELECT stripe_invoice_id FROM inv WHERE stripe_invoice_id IS NOT NULL)
    GROUP BY l.stripe_invoice_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', inv.id,
    'stripe_invoice_id', inv.stripe_invoice_id,
    'amount_due', COALESCE(inv.amount_due, 0),
    'status', COALESCE(inv.status, ''),
    'created_at', COALESCE(inv.created_at, '1970-01-01'),
    'due_date', inv.due_date,
    'hosted_invoice_url', inv.hosted_invoice_url,
    'line_items', COALESCE(lines.items, '[]'::jsonb)
  ) ORDER BY inv.created_at DESC), '[]'::jsonb)
  FROM inv
  LEFT JOIN lines ON lines.stripe_invoice_id = inv.stripe_invoice_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_customer_invoices_with_lines(uuid, int)
  TO authenticated, service_role;

-- ============================================================================
-- 6. TRIGGER: synka stripe_subscription_id till customer_profiles
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_customer_profile_subscription_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_profile_id IS NOT NULL THEN
    UPDATE public.customer_profiles
       SET stripe_subscription_id = NEW.stripe_subscription_id
     WHERE id = NEW.customer_profile_id
       AND (stripe_subscription_id IS DISTINCT FROM NEW.stripe_subscription_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_profile_subscription_id ON public.subscriptions;
CREATE TRIGGER trg_sync_customer_profile_subscription_id
  AFTER INSERT OR UPDATE OF stripe_subscription_id, customer_profile_id
  ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_profile_subscription_id();

COMMIT;