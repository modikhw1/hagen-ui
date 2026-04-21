begin;

create or replace function public.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    update public.profiles
       set role = new.role::text::public.user_role,
           is_admin = (new.role::text = 'admin')
     where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_roles_sync_profile on public.user_roles;
create trigger trg_user_roles_sync_profile
after insert or update on public.user_roles
for each row execute function public.sync_profile_role();

update public.profiles p
set role = ur.role::text::public.user_role,
    is_admin = (ur.role::text = 'admin')
from (
  select distinct on (user_id) user_id, role
  from public.user_roles
  order by user_id, case role::text when 'admin' then 0 when 'content_manager' then 1 when 'customer' then 2 else 3 end
) ur
where p.id = ur.user_id;

commit;
