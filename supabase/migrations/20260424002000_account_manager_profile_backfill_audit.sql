begin;

with resolved as (
  select
    cp.id as customer_id,
    tm.profile_id as profile_id
  from public.customer_profiles cp
  join public.team_members tm
    on (
      cp.account_manager_profile_id is not null
      and tm.profile_id = cp.account_manager_profile_id
    )
    or (
      cp.account_manager_profile_id is null
      and cp.account_manager is not null
      and (
        lower(coalesce(tm.email, '')) = lower(cp.account_manager)
        or lower(coalesce(tm.name, '')) = lower(cp.account_manager)
      )
    )
  where coalesce(cp.status, '') <> 'archived'
    and tm.profile_id is not null
)
update public.customer_profiles cp
set account_manager_profile_id = resolved.profile_id
from resolved
where cp.id = resolved.customer_id
  and cp.account_manager_profile_id is distinct from resolved.profile_id;

create or replace view public.v_admin_unmatched_account_managers as
select
  cp.id as customer_id,
  cp.business_name,
  cp.account_manager,
  cp.status,
  cp.updated_at
from public.customer_profiles cp
where coalesce(cp.status, '') <> 'archived'
  and cp.account_manager is not null
  and cp.account_manager_profile_id is null;

commit;
