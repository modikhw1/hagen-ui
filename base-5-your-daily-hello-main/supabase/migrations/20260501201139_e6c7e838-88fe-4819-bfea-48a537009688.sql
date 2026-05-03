CREATE OR REPLACE FUNCTION public.derive_customer_status(
  p_status text,
  p_archived_at timestamp with time zone,
  p_paused_until timestamp with time zone,
  p_invited_at timestamp with time zone,
  p_concepts_per_week integer,
  p_latest_planned_publish_date timestamp with time zone,
  p_escalation_flag boolean DEFAULT false,
  p_lifecycle_state text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
STABLE
AS $function$
  select case
    when coalesce(p_lifecycle_state,'') = 'archived'
      or p_archived_at is not null
      or coalesce(p_status,'') = 'archived' then 'archived'
    when coalesce(p_escalation_flag, false) = true then 'escalated'
    when coalesce(p_lifecycle_state,'') = 'paused'
      or (p_paused_until is not null and p_paused_until > now()) then 'paused'
    when coalesce(p_lifecycle_state,'') = 'draft' then 'draft'
    when coalesce(p_lifecycle_state,'') = 'invited'
      or coalesce(p_status,'') = 'invited' then
        case when p_invited_at > now() - interval '7 days' then 'invited_new' else 'invited_stale' end
    when coalesce(p_lifecycle_state,'') = 'active'
      or coalesce(p_status,'') in ('active','agreed') then
        case
          when p_concepts_per_week is null
            or p_latest_planned_publish_date is null
            or p_latest_planned_publish_date < now() then 'live_underfilled'
          else 'live_healthy'
        end
    else null
  end::text;
$function$;