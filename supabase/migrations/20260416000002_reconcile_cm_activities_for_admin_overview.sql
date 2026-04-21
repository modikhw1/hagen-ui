alter table public.cm_activities
  add column if not exists cm_id uuid references public.team_members(id) on delete set null,
  add column if not exists cm_name text,
  add column if not exists type text;

update public.cm_activities ca
set cm_id = tm.id
from public.team_members tm
where ca.cm_id is null
  and (
    (ca.cm_user_id is not null and tm.profile_id = ca.cm_user_id)
    or (ca.cm_email is not null and tm.email = ca.cm_email)
    or (ca.cm_email is not null and tm.name = ca.cm_email)
  );

update public.cm_activities ca
set cm_name = tm.name
from public.team_members tm
where ca.cm_name is null
  and ca.cm_id = tm.id;

update public.cm_activities
set type = case activity_type
  when 'concept_added' then 'concept_created'
  when 'concept_customized' then 'concept_updated'
  when 'concept_removed' then 'concept_removed'
  when 'email_sent' then 'email_sent'
  when 'gameplan_updated' then 'gameplan_updated'
  when 'customer_created' then 'customer_created'
  when 'customer_updated' then 'customer_updated'
  when 'customer_invited' then 'customer_invited'
  else activity_type
end
where type is null
  and activity_type is not null;

create index if not exists idx_cm_activities_team_member on public.cm_activities (cm_id, created_at desc);
create index if not exists idx_cm_activities_type_v2 on public.cm_activities (type);

create or replace function public.log_upload_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cm_id uuid;
  v_cm_email text;
  v_cm_name text;
begin
  select tm.id, tm.email, tm.name
    into v_cm_id, v_cm_email, v_cm_name
  from public.team_members tm
  where tm.id = NEW.account_manager_profile_id
     or tm.email = NEW.account_manager
     or tm.name = NEW.account_manager
  limit 1;

  insert into public.cm_activities (
    cm_user_id,
    cm_id,
    cm_email,
    cm_name,
    activity_type,
    type,
    customer_profile_id,
    description
  )
  values (
    (select profile_id from public.team_members where id = v_cm_id),
    v_cm_id,
    v_cm_email,
    v_cm_name,
    'customer_updated',
    'upload',
    NEW.id,
    'Kund laddade upp video'
  );

  return NEW;
end $$;

drop trigger if exists trg_customer_upload on public.customer_profiles;
create trigger trg_customer_upload
  after update of last_upload_at on public.customer_profiles
  for each row
  when (OLD.last_upload_at is distinct from NEW.last_upload_at and NEW.last_upload_at is not null)
  execute function public.log_upload_activity();
