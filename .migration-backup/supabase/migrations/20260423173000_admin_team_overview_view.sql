begin;

create or replace view public.admin_team_overview as
with active_assignments as (
  select
    ca.cm_id,
    cp.id as customer_id,
    cp.status,
    cp.monthly_price,
    cp.paused_until
  from public.cm_assignments ca
  join public.customer_profiles cp
    on cp.id = ca.customer_id
  where ca.valid_to is null
    and coalesce(cp.status, '') <> 'archived'
),
customer_rollup as (
  select
    cm_id,
    count(*)::int as customer_count,
    coalesce(
      sum(
        case
          when coalesce(status, '') in ('active', 'agreed', 'pending_invoice', 'pending_payment')
           and paused_until is null
            then coalesce(monthly_price, 0)::bigint * 100
          else 0
        end
      ),
      0
    )::bigint as mrr_ore
  from active_assignments
  group by cm_id
),
activity_rollup as (
  select
    coalesce(cm_id, cm_user_id) as cm_id,
    count(*) filter (where created_at >= now() - interval '30 days')::int as activity_events_30d,
    count(*) filter (where created_at >= now() - interval '7 days')::int as activity_events_7d
  from public.cm_activities
  group by coalesce(cm_id, cm_user_id)
),
active_absence as (
  select distinct on (a.cm_id)
    a.id as absence_id,
    a.cm_id,
    a.backup_cm_id,
    a.absence_type,
    a.compensation_mode,
    a.starts_on,
    a.ends_on,
    a.note
  from public.cm_absences a
  where a.customer_profile_id is null
    and current_date between a.starts_on and a.ends_on
  order by a.cm_id, a.starts_on desc, a.created_at desc
)
select
  tm.id,
  tm.profile_id,
  tm.name,
  tm.email,
  tm.phone,
  coalesce(tm.role, 'content_manager') as role,
  tm.avatar_url,
  tm.bio,
  tm.region as city,
  coalesce(tm.is_active, true) as is_active,
  coalesce(tm.commission_rate, 0.2) as commission_rate,
  coalesce(cr.customer_count, 0) as customer_count,
  coalesce(cr.mrr_ore, 0) as mrr_ore,
  case
    when coalesce(cr.customer_count, 0) <= 4 then 'ok'
    when coalesce(cr.customer_count, 0) <= 7 then 'warn'
    else 'overload'
  end as customer_load_level,
  case
    when coalesce(cr.customer_count, 0) >= 11 then 'Overbelastad'
    when coalesce(cr.customer_count, 0) >= 8 then 'Full portfolj'
    when coalesce(cr.customer_count, 0) >= 5 then 'Balans'
    else 'Latt portfolj'
  end as customer_load_label,
  (coalesce(cr.customer_count, 0) >= 11) as overloaded,
  coalesce(ar.activity_events_30d, 0) as activity_events_30d,
  coalesce(ar.activity_events_7d, 0) as activity_events_7d,
  aa.absence_id as active_absence_id,
  aa.backup_cm_id as active_absence_backup_cm_id,
  aa.absence_type as active_absence_type,
  aa.compensation_mode as active_absence_compensation_mode,
  aa.starts_on as active_absence_starts_on,
  aa.ends_on as active_absence_ends_on,
  aa.note as active_absence_note
from public.team_members tm
left join customer_rollup cr
  on cr.cm_id = tm.id
left join activity_rollup ar
  on ar.cm_id = tm.id
left join active_absence aa
  on aa.cm_id = tm.id
where coalesce(tm.is_active, true) = true;

comment on view public.admin_team_overview is
  'Admin team overview rollup for Team page: customer load, mrr, activity and active absence.';

commit;
