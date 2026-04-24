begin;

create or replace function public.admin_reassign_team_customers(
  p_source_cm_id uuid,
  p_target_cm_id uuid,
  p_customer_ids uuid[] default null,
  p_actor_user_id uuid default null,
  p_actor_email text default null,
  p_actor_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.team_members%rowtype;
  v_target public.team_members%rowtype;
  v_effective_date date := current_date;
  v_note text;
  v_selected_ids uuid[] := '{}'::uuid[];
  v_missing_ids uuid[] := '{}'::uuid[];
begin
  if p_source_cm_id is null then
    raise exception 'Kall-CM krävs';
  end if;

  if p_target_cm_id is null then
    raise exception 'Mål-CM krävs';
  end if;

  if p_source_cm_id = p_target_cm_id then
    raise exception 'Källa och mål-CM måste vara olika';
  end if;

  select *
    into v_source
  from public.team_members
  where id = p_source_cm_id
  for update;

  if not found then
    raise exception 'Teammedlem hittades inte';
  end if;

  select *
    into v_target
  from public.team_members
  where id = p_target_cm_id
  for update;

  if not found then
    raise exception 'Vald ersättare hittades inte';
  end if;

  if coalesce(v_target.is_active, false) = false then
    raise exception 'Vald ersättare måste vara aktiv';
  end if;

  with owned_customers as (
    select cp.id
    from public.cm_assignments ca
    join public.customer_profiles cp
      on cp.id = ca.customer_id
    where ca.cm_id = p_source_cm_id
      and ca.valid_to is null
      and coalesce(cp.status, '') <> 'archived'
  ),
  selected_customers as (
    select id
    from owned_customers
    where p_customer_ids is null
       or id = any(p_customer_ids)
  )
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_selected_ids
  from selected_customers;

  if p_customer_ids is not null then
    select coalesce(array_agg(requested_id), '{}'::uuid[])
      into v_missing_ids
    from unnest(p_customer_ids) as requested_id
    where not requested_id = any(v_selected_ids);

    if coalesce(array_length(v_missing_ids, 1), 0) > 0 then
      raise exception 'En eller flera kunder tillhör inte vald CM';
    end if;
  end if;

  if coalesce(array_length(v_selected_ids, 1), 0) = 0 then
    return jsonb_build_object(
      'source_cm_id', p_source_cm_id,
      'target_cm_id', p_target_cm_id,
      'effective_date', v_effective_date::text,
      'reassigned_count', 0,
      'customers', '[]'::jsonb
    );
  end if;

  v_note := format(
    'Omfördelad från %s till %s.',
    coalesce(v_source.name, 'okänd CM'),
    coalesce(v_target.name, 'okänd CM')
  );

  update public.cm_assignments
     set valid_to = v_effective_date - 1,
         scheduled_change = null,
         handover_note = v_note
   where cm_id = p_source_cm_id
     and valid_to is null
     and customer_id = any(v_selected_ids);

  insert into public.cm_assignments (
    customer_id,
    cm_id,
    valid_from,
    valid_to,
    scheduled_change,
    handover_note
  )
  select
    cp.id,
    v_target.id,
    v_effective_date,
    null,
    null,
    v_note
  from public.customer_profiles cp
  where cp.id = any(v_selected_ids);

  update public.customer_profiles
     set account_manager_profile_id = v_target.profile_id,
         account_manager = coalesce(nullif(v_target.email, ''), nullif(v_target.name, ''))
   where id = any(v_selected_ids);

  insert into public.audit_log (
    actor_user_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    metadata
  )
  select
    p_actor_user_id,
    p_actor_email,
    p_actor_role,
    'admin.team.reassign',
    'customer_profile',
    cp.id::text,
    jsonb_build_object(
      'source_cm_id', p_source_cm_id,
      'target_cm_id', p_target_cm_id,
      'effective_date', v_effective_date::text
    )
  from public.customer_profiles cp
  where cp.id = any(v_selected_ids);

  return jsonb_build_object(
    'source_cm_id', p_source_cm_id,
    'target_cm_id', p_target_cm_id,
    'effective_date', v_effective_date::text,
    'reassigned_count', coalesce(array_length(v_selected_ids, 1), 0),
    'customers', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'customerId', cp.id,
            'customerName', cp.business_name
          )
          order by cp.business_name nulls last, cp.id
        )
        from public.customer_profiles cp
        where cp.id = any(v_selected_ids)
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.admin_update_team_member(
  p_cm_id uuid,
  p_profile jsonb default '{}'::jsonb,
  p_commission_rate numeric default null,
  p_reassign_to_cm_id uuid default null,
  p_actor_user_id uuid default null,
  p_actor_email text default null,
  p_actor_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_assignment_result jsonb := null;
begin
  if p_cm_id is null then
    raise exception 'Teammedlems-ID krävs';
  end if;

  if p_commission_rate is not null and (p_commission_rate < 0 or p_commission_rate > 1) then
    raise exception 'commission_rate måste vara mellan 0 och 1';
  end if;

  select to_jsonb(tm.*)
    into v_before
  from public.team_members tm
  where tm.id = p_cm_id
  for update;

  if v_before is null then
    raise exception 'Teammedlem hittades inte';
  end if;

  if p_reassign_to_cm_id is not null then
    v_assignment_result := public.admin_reassign_team_customers(
      p_cm_id,
      p_reassign_to_cm_id,
      null,
      p_actor_user_id,
      p_actor_email,
      p_actor_role
    );
  end if;

  update public.team_members
     set name = case when p_profile ? 'name' then p_profile ->> 'name' else name end,
         email = case when p_profile ? 'email' then nullif(p_profile ->> 'email', '') else email end,
         phone = case when p_profile ? 'phone' then nullif(p_profile ->> 'phone', '') else phone end,
         region = case when p_profile ? 'city' then nullif(p_profile ->> 'city', '') else region end,
         bio = case when p_profile ? 'bio' then nullif(p_profile ->> 'bio', '') else bio end,
         avatar_url = case when p_profile ? 'avatar_url' then nullif(p_profile ->> 'avatar_url', '') else avatar_url end,
         commission_rate = coalesce(p_commission_rate, commission_rate)
   where id = p_cm_id;

  select to_jsonb(tm.*)
    into v_after
  from public.team_members tm
  where tm.id = p_cm_id;

  insert into public.audit_log (
    actor_user_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state,
    metadata
  )
  values (
    p_actor_user_id,
    p_actor_email,
    p_actor_role,
    'admin.team.updated',
    'team_member',
    p_cm_id::text,
    v_before,
    v_after,
    case
      when v_assignment_result is null then null
      else jsonb_build_object('assignment_result', v_assignment_result)
    end
  );

  return jsonb_build_object(
    'member', v_after,
    'assignment_result', v_assignment_result
  );
end;
$$;

commit;
