begin;

alter type public.app_role add value if not exists 'user';

insert into public.user_roles (user_id, role)
select
  p.id,
  case
    when coalesce(p.is_admin, false) then 'admin'::public.app_role
    when coalesce(p.role::text, '') in ('admin', 'content_manager', 'customer', 'user')
      then p.role::text::public.app_role
    else 'user'::public.app_role
  end as role
from public.profiles p
on conflict (user_id, role) do nothing;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

create or replace function public.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid := coalesce(new.user_id, old.user_id);
  primary_role public.app_role;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  select ur.role
    into primary_role
  from public.user_roles ur
  where ur.user_id = target_user_id
  order by case ur.role::text
    when 'admin' then 0
    when 'content_manager' then 1
    when 'customer' then 2
    else 3
  end
  limit 1;

  update public.profiles
     set role = coalesce(primary_role::text, 'user')::public.user_role,
         is_admin = coalesce(primary_role::text, 'user') = 'admin'
   where id = target_user_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_user_roles_sync_profile on public.user_roles;
create trigger trg_user_roles_sync_profile
after insert or update or delete on public.user_roles
for each row execute function public.sync_profile_role();

create or replace function public.sync_user_roles_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_role public.app_role;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  desired_role := case
    when coalesce(new.is_admin, false) then 'admin'::public.app_role
    when coalesce(new.role::text, '') in ('admin', 'content_manager', 'customer', 'user')
      then new.role::text::public.app_role
    else 'user'::public.app_role
  end;

  delete from public.user_roles
  where user_id = new.id
    and role <> desired_role;

  insert into public.user_roles (user_id, role)
  values (new.id, desired_role)
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_user_roles on public.profiles;
create trigger trg_profiles_sync_user_roles
after insert or update of role, is_admin on public.profiles
for each row execute function public.sync_user_roles_from_profile();

update public.profiles p
set role = role_map.primary_role::text::public.user_role,
    is_admin = role_map.primary_role::text = 'admin'
from (
  select distinct on (ur.user_id)
    ur.user_id,
    ur.role as primary_role
  from public.user_roles ur
  order by
    ur.user_id,
    case ur.role::text
      when 'admin' then 0
      when 'content_manager' then 1
      when 'customer' then 2
      else 3
    end
) as role_map
where p.id = role_map.user_id;

drop table if exists public.tiktok_oauth_tokens cascade;

alter table if exists public.tiktok_videos enable row level security;

drop policy if exists "tt_videos_admin_or_assigned_select" on public.tiktok_videos;
drop policy if exists "tt_videos_access_select" on public.tiktok_videos;

create policy "tt_videos_access_select" on public.tiktok_videos
for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or (
    public.has_role(auth.uid(), 'content_manager')
    and exists (
      select 1
      from public.customer_profiles cp
      join public.team_members tm
        on tm.profile_id = auth.uid()
      where cp.id = tiktok_videos.customer_profile_id
        and (
          cp.account_manager_profile_id = tm.profile_id
          or lower(coalesce(cp.account_manager, '')) = lower(coalesce(tm.email, ''))
          or lower(coalesce(cp.account_manager, '')) = lower(tm.name)
        )
    )
  )
  or exists (
    select 1
    from public.customer_profiles cp
    join public.profiles p
      on p.id = auth.uid()
    where cp.id = tiktok_videos.customer_profile_id
      and lower(coalesce(cp.contact_email, '')) = lower(coalesce(p.email, ''))
  )
);

commit;
