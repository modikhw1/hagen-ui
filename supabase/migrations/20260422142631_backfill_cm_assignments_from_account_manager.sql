begin;

with missing_customers as (
  select
    cp.id as customer_id,
    cp.account_manager_profile_id,
    cp.account_manager,
    coalesce(cp.contract_start_date, cp.created_at::date, current_date) as valid_from
  from public.customer_profiles cp
  where coalesce(cp.status, '') <> 'archived'
    and not exists (
      select 1
      from public.cm_assignments ca
      where ca.customer_id = cp.id
        and ca.valid_to is null
    )
),
resolved_targets as (
  select distinct on (mc.customer_id)
    mc.customer_id,
    mc.valid_from,
    tm.id as cm_id,
    tm.profile_id as cm_profile_id,
    coalesce(nullif(tm.email, ''), nullif(tm.name, ''), mc.account_manager) as account_manager_value
  from missing_customers mc
  join public.team_members tm
    on (
      mc.account_manager_profile_id is not null
      and tm.profile_id = mc.account_manager_profile_id
    )
    or (
      mc.account_manager is not null
      and (
        lower(coalesce(tm.email, '')) = lower(mc.account_manager)
        or lower(coalesce(tm.name, '')) = lower(mc.account_manager)
      )
    )
  where coalesce(tm.is_active, false) = true
  order by
    mc.customer_id,
    case
      when mc.account_manager_profile_id is not null
       and tm.profile_id = mc.account_manager_profile_id then 0
      when lower(coalesce(tm.email, '')) = lower(coalesce(mc.account_manager, '')) then 1
      when lower(coalesce(tm.name, '')) = lower(coalesce(mc.account_manager, '')) then 2
      else 3
    end,
    tm.created_at asc nulls last,
    tm.id
)
insert into public.cm_assignments (
  customer_id,
  cm_id,
  valid_from,
  valid_to,
  handover_note,
  scheduled_change
)
select
  rt.customer_id,
  rt.cm_id,
  rt.valid_from,
  null,
  'Backfilled from customer_profiles.account_manager',
  null
from resolved_targets rt
where not exists (
  select 1
  from public.cm_assignments existing
  where existing.customer_id = rt.customer_id
    and existing.valid_to is null
);

with normalized_targets as (
  select distinct on (cp.id)
    cp.id as customer_id,
    tm.profile_id as cm_profile_id,
    coalesce(nullif(tm.email, ''), nullif(tm.name, ''), cp.account_manager) as account_manager_value
  from public.customer_profiles cp
  join public.team_members tm
    on (
      cp.account_manager_profile_id is not null
      and tm.profile_id = cp.account_manager_profile_id
    )
    or (
      cp.account_manager is not null
      and (
        lower(coalesce(tm.email, '')) = lower(cp.account_manager)
        or lower(coalesce(tm.name, '')) = lower(cp.account_manager)
      )
    )
  where coalesce(cp.status, '') <> 'archived'
    and coalesce(tm.is_active, false) = true
  order by
    cp.id,
    case
      when cp.account_manager_profile_id is not null
       and tm.profile_id = cp.account_manager_profile_id then 0
      when lower(coalesce(tm.email, '')) = lower(coalesce(cp.account_manager, '')) then 1
      when lower(coalesce(tm.name, '')) = lower(coalesce(cp.account_manager, '')) then 2
      else 3
    end,
    tm.created_at asc nulls last,
    tm.id
)
update public.customer_profiles cp
set
  account_manager_profile_id = nt.cm_profile_id,
  account_manager = nt.account_manager_value
from normalized_targets nt
where cp.id = nt.customer_id
  and (
    cp.account_manager_profile_id is distinct from nt.cm_profile_id
    or cp.account_manager is distinct from nt.account_manager_value
  );

commit;
