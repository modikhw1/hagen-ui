begin;

create table if not exists public.admin_customer_action_locks (
  lock_key text primary key,
  customer_profile_id uuid not null references public.customer_profiles(id) on delete cascade,
  request_id text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists admin_customer_action_locks_customer_idx
  on public.admin_customer_action_locks (customer_profile_id, expires_at desc);

create table if not exists public.admin_idempotency_keys (
  key text primary key,
  operation text not null,
  customer_id uuid,
  demo_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_idempotency_keys_operation_created_at_idx
  on public.admin_idempotency_keys(operation, created_at desc);

create index if not exists customer_profiles_created_at_desc
  on public.customer_profiles (created_at desc);

create index if not exists attention_snoozes_subject_active_lookup
  on public.attention_snoozes (subject_id)
  where released_at is null;

create index if not exists cm_assignments_active_customer_idx
  on public.cm_assignments (customer_id)
  where valid_to is null;

create or replace view public.v_admin_billing_mrr as
select
  environment,
  sum(
    case
      when interval = 'year' then round(amount::numeric / 12)
      when interval = 'month' and interval_count = 3 then round(amount::numeric / 3)
      when interval = 'month' and interval_count > 1 then round(amount::numeric / interval_count)
      else amount::numeric
    end
  )::bigint as mrr_ore
from public.subscriptions
where status = 'active'
  and coalesce(cancel_at_period_end, false) = false
group by environment;

create or replace view public.v_admin_invoices as
select
  i.id,
  i.stripe_invoice_id,
  i.customer_profile_id,
  i.stripe_customer_id,
  i.amount_due,
  i.amount_paid,
  i.status,
  i.environment,
  i.created_at,
  i.due_date,
  i.hosted_invoice_url,
  coalesce(cp.business_name, sc_lookup.business_name, left(i.stripe_customer_id, 18), 'Okand') as customer_name,
  greatest(coalesce(cn.total_credits, 0), coalesce(r.total_refunds, 0)) as refunded_ore,
  case
    when greatest(coalesce(cn.total_credits, 0), coalesce(r.total_refunds, 0)) <= 0 then null
    when greatest(coalesce(cn.total_credits, 0), coalesce(r.total_refunds, 0)) <
         greatest(coalesce(i.amount_paid, 0), coalesce(i.amount_due, 0)) then 'partially_refunded'
    else 'refunded'
  end as refund_state,
  case
    when greatest(coalesce(cn.total_credits, 0), coalesce(r.total_refunds, 0)) > 0
     and greatest(coalesce(cn.total_credits, 0), coalesce(r.total_refunds, 0)) <
         greatest(coalesce(i.amount_paid, 0), coalesce(i.amount_due, 0)) then 'partially_refunded'
    else i.status
  end as display_status
from public.invoices i
left join public.customer_profiles cp on cp.id = i.customer_profile_id
left join public.customer_profiles sc_lookup on sc_lookup.stripe_customer_id = i.stripe_customer_id
left join (
  select stripe_invoice_id, sum(greatest(0, total)) as total_credits
  from public.stripe_credit_notes
  group by stripe_invoice_id
) cn on cn.stripe_invoice_id = i.stripe_invoice_id
left join (
  select stripe_invoice_id, sum(greatest(0, amount)) as total_refunds
  from public.stripe_refunds
  group by stripe_invoice_id
) r on r.stripe_invoice_id = i.stripe_invoice_id;

create or replace view public.v_admin_subscriptions as
select
  s.id,
  s.customer_profile_id,
  s.stripe_customer_id,
  s.stripe_subscription_id,
  s.status,
  s.amount,
  s.currency,
  s.interval,
  s.interval_count,
  s.created,
  s.current_period_start,
  s.current_period_end,
  s.cancel_at_period_end,
  s.canceled_at,
  s.environment,
  coalesce(cp.business_name, sc_lookup.business_name, left(s.stripe_customer_id, 18), 'Okand') as customer_name
from public.subscriptions s
left join public.customer_profiles cp on cp.id = s.customer_profile_id
left join public.customer_profiles sc_lookup on sc_lookup.stripe_customer_id = s.stripe_customer_id;

create or replace view public.v_admin_payroll_period as
select
  to_char(period_start::date, 'YYYY-MM') as period_key,
  to_char(period_start::date, 'Mon YYYY') as period_label,
  period_start::date as period_start,
  period_end::date as period_end,
  stripe_invoice_id,
  sum(amount)::bigint as billed_ore
from public.invoice_line_items
where period_start is not null
  and period_end is not null
group by 1, 2, 3, 4, 5;

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
    raise exception 'source_cm_required';
  end if;

  if p_target_cm_id is null then
    raise exception 'target_cm_required';
  end if;

  if p_source_cm_id = p_target_cm_id then
    raise exception 'source_and_target_must_differ';
  end if;

  select *
    into v_source
  from public.team_members
  where id = p_source_cm_id
  for update;

  if not found then
    raise exception 'source_team_member_not_found';
  end if;

  select *
    into v_target
  from public.team_members
  where id = p_target_cm_id
  for update;

  if not found then
    raise exception 'target_team_member_not_found';
  end if;

  if coalesce(v_target.is_active, false) = false then
    raise exception 'target_team_member_must_be_active';
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
      raise exception 'customer_selection_mismatch';
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
    'Reassigned from %s to %s.',
    coalesce(v_source.name, 'unknown'),
    coalesce(v_target.name, 'unknown')
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
    raise exception 'team_member_id_required';
  end if;

  if p_commission_rate is not null and (p_commission_rate < 0 or p_commission_rate > 1) then
    raise exception 'commission_rate_out_of_range';
  end if;

  select to_jsonb(tm.*)
    into v_before
  from public.team_members tm
  where tm.id = p_cm_id
  for update;

  if v_before is null then
    raise exception 'team_member_not_found';
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

create or replace function public.admin_get_customer_detail(p_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profile', to_jsonb(cp),
    'buffer_row', (
      select to_jsonb(vb)
      from public.v_customer_buffer vb
      where vb.customer_id = cp.id
    ),
    'attention_snoozes', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.snoozed_at desc)
      from public.attention_snoozes s
      where s.subject_type in ('onboarding', 'customer_blocking')
        and s.subject_id = cp.id::text
        and s.released_at is null
    ), '[]'::jsonb),
    'coverage_absences', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ca.id,
          'cm_id', ca.cm_id,
          'cm_name', cm.name,
          'backup_cm_id', ca.backup_cm_id,
          'backup_cm_name', backup.name,
          'absence_type', ca.absence_type,
          'compensation_mode', ca.compensation_mode,
          'starts_on', ca.starts_on,
          'ends_on', ca.ends_on,
          'note', ca.note,
          'is_active', ca.starts_on <= current_date and ca.ends_on >= current_date,
          'is_upcoming', ca.starts_on > current_date
        )
        order by ca.starts_on desc
      )
      from (
        select
          id,
          cm_id,
          backup_cm_id,
          absence_type,
          compensation_mode,
          starts_on,
          ends_on,
          note
        from public.cm_absences
        where customer_profile_id = cp.id
        order by starts_on desc
        limit 10
      ) ca
      left join public.team_members cm on cm.id = ca.cm_id
      left join public.team_members backup on backup.id = ca.backup_cm_id
    ), '[]'::jsonb)
  )
  from public.customer_profiles cp
  where cp.id = p_id;
$$;

create or replace function public.admin_convert_demo_to_customer(
  p_demo_id uuid,
  p_owner_admin_id uuid,
  p_billing_day int,
  p_contract_start_date date,
  p_idempotency_key text
) returns table(customer_id uuid, demo_id uuid, was_idempotent_replay boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_customer uuid;
  v_demo demos%rowtype;
  v_customer customer_profiles%rowtype;
  v_customer_id uuid;
  v_monthly_price integer;
  v_pricing_status text;
begin
  select admin_idempotency_keys.customer_id
    into v_existing_customer
  from public.admin_idempotency_keys
  where key = p_idempotency_key
    and operation = 'demo.convert';

  if v_existing_customer is not null then
    return query select v_existing_customer, p_demo_id, true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('demo.convert:' || p_demo_id::text));

  select *
    into v_demo
  from public.demos
  where id = p_demo_id
  for update;

  if not found then
    raise exception 'demo_not_found';
  end if;

  select id
    into v_existing_customer
  from public.customer_profiles
  where from_demo_id = p_demo_id
  limit 1;

  if v_existing_customer is not null then
    raise exception 'demo_already_converted';
  end if;

  v_monthly_price := coalesce(v_demo.proposed_price_ore / 100, 0);
  v_pricing_status := case when v_demo.proposed_price_ore is null then 'unknown' else 'fixed' end;

  insert into public.customer_profiles (
    business_name,
    contact_email,
    customer_contact_name,
    tiktok_handle,
    tiktok_profile_pic_url,
    concepts_per_week,
    expected_concepts_per_week,
    monthly_price,
    pricing_status,
    contract_start_date,
    billing_day_of_month,
    first_invoice_behavior,
    from_demo_id,
    status
  )
  values (
    v_demo.company_name,
    v_demo.contact_email,
    v_demo.contact_name,
    v_demo.tiktok_handle,
    v_demo.tiktok_profile_pic_url,
    coalesce(v_demo.proposed_concepts_per_week, 2),
    coalesce(v_demo.proposed_concepts_per_week, 2),
    v_monthly_price,
    v_pricing_status,
    p_contract_start_date,
    p_billing_day,
    'charge_full',
    p_demo_id,
    'pending'
  )
  returning * into v_customer;

  v_customer_id := v_customer.id;

  update public.demos
  set status = 'won',
      owner_admin_id = coalesce(owner_admin_id, p_owner_admin_id),
      status_changed_at = now(),
      responded_at = coalesce(responded_at, now()),
      resolved_at = now()
  where id = p_demo_id;

  insert into public.admin_idempotency_keys(key, operation, customer_id, demo_id, created_at)
  values (p_idempotency_key, 'demo.convert', v_customer_id, p_demo_id, now())
  on conflict (key) do nothing;

  return query select v_customer_id, p_demo_id, false;
end;
$$;

create or replace function public.admin_create_customer(
  p_business_name text,
  p_contact_email text,
  p_customer_contact_name text default null,
  p_phone text default null,
  p_account_manager text default null,
  p_account_manager_profile_id uuid default null,
  p_monthly_price integer default 0,
  p_pricing_status text default 'fixed',
  p_contract_start_date date default current_date,
  p_billing_day_of_month integer default 25,
  p_first_invoice_behavior text default 'prorated',
  p_discount_type text default 'none',
  p_discount_value integer default 0,
  p_discount_duration_months integer default 1,
  p_discount_start_date date default null,
  p_discount_end_date date default null,
  p_upcoming_monthly_price integer default null,
  p_upcoming_price_effective_date date default null,
  p_subscription_interval text default 'month',
  p_invoice_text text default null,
  p_scope_items jsonb default '[]'::jsonb,
  p_price_start_date date default null,
  p_price_end_date date default null,
  p_contacts jsonb default '[]'::jsonb,
  p_profile_data jsonb default '{}'::jsonb,
  p_game_plan jsonb default '{}'::jsonb,
  p_concepts jsonb default '[]'::jsonb,
  p_tiktok_profile_url text default null,
  p_tiktok_handle text default null,
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
  v_customer public.customer_profiles%rowtype;
  v_cm_id uuid;
begin
  if coalesce(trim(p_business_name), '') = '' then
    raise exception 'business_name_required';
  end if;

  if coalesce(trim(p_contact_email), '') = '' then
    raise exception 'contact_email_required';
  end if;

  if p_billing_day_of_month < 1 or p_billing_day_of_month > 28 then
    raise exception 'billing_day_out_of_range';
  end if;

  if coalesce(p_pricing_status, 'fixed') not in ('fixed', 'unknown') then
    raise exception 'invalid_pricing_status';
  end if;

  if coalesce(p_first_invoice_behavior, 'prorated') not in ('prorated', 'full', 'free_until_anchor') then
    raise exception 'invalid_first_invoice_behavior';
  end if;

  if coalesce(p_subscription_interval, 'month') not in ('month', 'quarter', 'year') then
    raise exception 'invalid_subscription_interval';
  end if;

  insert into public.customer_profiles (
    business_name,
    contact_email,
    customer_contact_name,
    phone,
    account_manager,
    account_manager_profile_id,
    concepts_per_week,
    expected_concepts_per_week,
    monthly_price,
    pricing_status,
    contract_start_date,
    billing_day_of_month,
    first_invoice_behavior,
    discount_type,
    discount_value,
    discount_duration_months,
    discount_start_date,
    discount_end_date,
    upcoming_monthly_price,
    upcoming_price_effective_date,
    subscription_interval,
    invoice_text,
    scope_items,
    price_start_date,
    price_end_date,
    contacts,
    profile_data,
    game_plan,
    concepts,
    tiktok_profile_url,
    tiktok_handle,
    status
  )
  values (
    p_business_name,
    p_contact_email,
    p_customer_contact_name,
    p_phone,
    p_account_manager,
    p_account_manager_profile_id,
    2,
    2,
    coalesce(p_monthly_price, 0),
    coalesce(p_pricing_status, 'fixed'),
    coalesce(p_contract_start_date, current_date),
    p_billing_day_of_month,
    coalesce(p_first_invoice_behavior, 'prorated'),
    coalesce(p_discount_type, 'none'),
    coalesce(p_discount_value, 0),
    coalesce(p_discount_duration_months, 1),
    p_discount_start_date,
    p_discount_end_date,
    p_upcoming_monthly_price,
    p_upcoming_price_effective_date,
    coalesce(p_subscription_interval, 'month'),
    p_invoice_text,
    coalesce(p_scope_items, '[]'::jsonb),
    p_price_start_date,
    p_price_end_date,
    coalesce(p_contacts, '[]'::jsonb),
    coalesce(p_profile_data, '{}'::jsonb),
    coalesce(p_game_plan, '{}'::jsonb),
    coalesce(p_concepts, '[]'::jsonb),
    p_tiktok_profile_url,
    p_tiktok_handle,
    'pending'
  )
  returning * into v_customer;

  if p_account_manager_profile_id is not null then
    select tm.id
      into v_cm_id
    from public.team_members tm
    where tm.profile_id = p_account_manager_profile_id
    order by tm.created_at asc nulls last, tm.id asc
    limit 1;

    if v_cm_id is not null then
      insert into public.cm_assignments (
        customer_id,
        cm_id,
        valid_from,
        valid_to,
        handover_note,
        scheduled_change
      )
      values (
        v_customer.id,
        v_cm_id,
        current_date,
        null,
        null,
        null
      );
    end if;
  end if;

  update public.subscriptions
     set pause_until = v_customer.paused_until,
         scheduled_price_change = case
           when v_customer.upcoming_monthly_price is null
             or v_customer.upcoming_price_effective_date is null
             then null
           else jsonb_build_object(
             'current_monthly_price', coalesce(v_customer.monthly_price, 0),
             'next_monthly_price', v_customer.upcoming_monthly_price,
             'effective_date', v_customer.upcoming_price_effective_date
           )
         end
   where customer_profile_id = v_customer.id;

  insert into public.audit_log (
    actor_user_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    after_state,
    metadata
  )
  values (
    p_actor_user_id,
    p_actor_email,
    p_actor_role,
    'admin.customer.created',
    'customer_profile',
    v_customer.id::text,
    to_jsonb(v_customer),
    jsonb_build_object(
      'source', 'admin_create_customer',
      'assignment_created', v_cm_id is not null
    )
  );

  return jsonb_build_object(
    'customer', to_jsonb(v_customer),
    'assignment_created', v_cm_id is not null
  );
end;
$$;

grant select on public.v_admin_billing_mrr to authenticated, service_role;
grant select on public.v_admin_invoices to authenticated, service_role;
grant select on public.v_admin_subscriptions to authenticated, service_role;
grant select on public.v_admin_payroll_period to authenticated, service_role;

grant all on table public.admin_customer_action_locks to service_role;
grant all on table public.admin_idempotency_keys to service_role;

grant execute on function public.admin_reassign_team_customers(uuid, uuid, uuid[], uuid, text, text)
  to authenticated, service_role;
grant execute on function public.admin_update_team_member(uuid, jsonb, numeric, uuid, uuid, text, text)
  to authenticated, service_role;
grant execute on function public.admin_get_customer_detail(uuid)
  to authenticated, service_role;
grant execute on function public.admin_convert_demo_to_customer(uuid, uuid, int, date, text)
  to authenticated, service_role;
grant execute on function public.admin_create_customer(
  text,
  text,
  text,
  text,
  text,
  uuid,
  integer,
  text,
  date,
  integer,
  text,
  text,
  integer,
  integer,
  date,
  date,
  integer,
  date,
  text,
  text,
  jsonb,
  date,
  date,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  uuid,
  text,
  text
) to authenticated, service_role;

commit;
