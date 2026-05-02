create or replace function public.log_concept_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cm_id uuid;
  v_cm_email text;
  v_cm_name text;
  v_type text;
begin
  if NEW.cm_id is null then
    return NEW;
  end if;

  select
    tm.id,
    coalesce(p.email, tm.email),
    tm.name
  into v_cm_id, v_cm_email, v_cm_name
  from public.team_members tm
  left join public.profiles p on p.id = tm.profile_id
  where tm.profile_id = NEW.cm_id
  limit 1;

  if TG_OP = 'INSERT' then
    v_type := 'concept_created';
  elsif NEW.status = 'sent' and OLD.status is distinct from 'sent' then
    v_type := 'concept_sent';
  else
    v_type := 'concept_updated';
  end if;

  insert into public.cm_activities (
    cm_user_id,
    cm_id,
    cm_email,
    cm_name,
    activity_type,
    type,
    customer_profile_id,
    description,
    metadata
  )
  values (
    NEW.cm_id,
    v_cm_id,
    coalesce(v_cm_email, 'unknown'),
    v_cm_name,
    v_type,
    v_type,
    NEW.customer_profile_id,
    coalesce(
      nullif(NEW.custom_headline, ''),
      NEW.content_overrides->>'headline',
      'Koncept'
    ),
    jsonb_build_object('concept_id', NEW.id, 'status', NEW.status)
  );

  return NEW;
end $$;
