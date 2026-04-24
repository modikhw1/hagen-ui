begin;

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
    raise exception 'Foretagsnamn kravs';
  end if;

  if coalesce(trim(p_contact_email), '') = '' then
    raise exception 'Kontaktmejl kravs';
  end if;

  if p_billing_day_of_month < 1 or p_billing_day_of_month > 28 then
    raise exception 'billing_day_of_month maste vara mellan 1 och 28';
  end if;

  if coalesce(p_pricing_status, 'fixed') not in ('fixed', 'unknown') then
    raise exception 'Ogiltig pricing_status';
  end if;

  if coalesce(p_first_invoice_behavior, 'prorated') not in ('prorated', 'full', 'free_until_anchor') then
    raise exception 'Ogiltig first_invoice_behavior';
  end if;

  if coalesce(p_subscription_interval, 'month') not in ('month', 'quarter', 'year') then
    raise exception 'Ogiltig subscription_interval';
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
) to authenticated;

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
) to service_role;

commit;
