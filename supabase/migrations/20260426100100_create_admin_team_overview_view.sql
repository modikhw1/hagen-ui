DROP VIEW IF EXISTS public.v_admin_team_overview CASCADE;

CREATE OR REPLACE VIEW public.v_admin_team_overview AS
SELECT
  tm.id,
  tm.name,
  tm.email,
  tm.phone,
  tm.city,
  tm.bio,
  tm.avatar_url,
  tm.role,
  tm.is_active,
  tm.commission_rate,
  p.customer_count,
  p.mrr_ore,
  p.customers,
  ah.assignment_history,
  abs.active_absence,
  abs.is_covering,
  -- Load Classification
  CASE
    WHEN p.customer_count / 12.0 >= 0.92 THEN 'overload'
    WHEN p.customer_count / 12.0 >= 0.67 THEN 'overload'
    WHEN p.customer_count / 12.0 >= 0.25 THEN 'warn'
    ELSE 'ok'
  END as "customerLoadLevel",
  CASE
    WHEN p.customer_count / 12.0 >= 0.92 THEN 'överbelastad'
    WHEN p.customer_count / 12.0 >= 0.67 THEN 'full portfölj'
    WHEN p.customer_count / 12.0 >= 0.25 THEN 'balans'
    ELSE 'lätt portfölj'
  END as "customerLoadLabel",
  (p.customer_count / 12.0 >= 0.92) as overloaded
FROM public.team_members tm
LEFT JOIN LATERAL (
  SELECT
    count(cws.id) as customer_count,
    coalesce(sum(CASE WHEN cws.status = ANY(ARRAY['active', 'agreed', 'pending_invoice', 'pending_payment']) THEN cws.monthly_price * 100 ELSE 0 END), 0)::bigint as mrr_ore,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', cws.id, 
          'business_name', cws.business_name,
          'monthly_price', cws.monthly_price,
          'status', cws.status,
          'followers', coalesce(cws.followers, 0),
          'videos_last_7d', coalesce(cws.videos_last_7d, 0),
          'engagement_rate', coalesce(cws.engagement_rate, 0),
          'last_upload_at', cws.last_upload_at,
          'covered_by_absence', false,
          'payout_cm_id', tm.profile_id
        )
      ) FILTER (WHERE cws.id IS NOT NULL), 
      '[]'::jsonb
    ) as customers
  FROM (
    SELECT 
      cp.id, cp.business_name, cp.monthly_price, cp.status, cp.last_upload_at, cp.account_manager_profile_id,
      stats.followers, stats.videos_last_7d, stats.engagement_rate
    FROM public.customer_profiles cp
    LEFT JOIN (
      SELECT
        customer_profile_id,
        (array_agg(followers ORDER BY snapshot_date DESC))[1] as followers,
        sum(videos_last_24h) as videos_last_7d,
        (array_agg(engagement_rate ORDER BY snapshot_date DESC))[1] as engagement_rate
      FROM public.tiktok_stats
      WHERE snapshot_date >= (now() - interval '7 days')::date
      GROUP BY customer_profile_id
    ) stats ON stats.customer_profile_id = cp.id
  ) cws
  WHERE cws.account_manager_profile_id = tm.profile_id
    AND cws.status <> 'archived'
) p ON true
LEFT JOIN LATERAL (
  SELECT
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ca.id,
          'customer_id', ca.customer_id,
          'customer_name', cp.business_name,
          'starts_on', ca.valid_from,
          'ends_on', ca.valid_to,
          'valid_from', ca.valid_from,
          'valid_to', ca.valid_to,
          'handover_note', ca.handover_note,
          'scheduled_effective_date', ca.scheduled_change->>'effective_date'
        ) ORDER BY ca.valid_from DESC
      ) FILTER (WHERE ca.id IS NOT NULL),
      '[]'::jsonb
    ) as assignment_history
  FROM public.cm_assignments ca
  JOIN public.customer_profiles cp ON cp.id = ca.customer_id
  WHERE ca.cm_id = tm.id
) ah ON true
LEFT JOIN LATERAL (
  SELECT 
    to_jsonb(aa.*) as active_absence,
    EXISTS (SELECT 1 FROM public.cm_absences WHERE backup_cm_id = tm.id AND now()::date BETWEEN starts_on AND ends_on) as is_covering
  FROM public.cm_absences aa
  WHERE aa.cm_id = tm.id 
    AND aa.customer_profile_id IS NULL
    AND now()::date BETWEEN aa.starts_on AND aa.ends_on
  LIMIT 1
) abs ON true
WHERE tm.is_active = true AND tm.role = 'content_manager';
