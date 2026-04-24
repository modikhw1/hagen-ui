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
  from admin_idempotency_keys
  where key = p_idempotency_key
    and operation = 'demo.convert';

  if v_existing_customer is not null then
    return query select v_existing_customer, p_demo_id, true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('demo.convert:' || p_demo_id::text));

  select *
    into v_demo
  from demos
  where id = p_demo_id
  for update;

  if not found then
    raise exception 'demo_not_found';
  end if;

  select id
    into v_existing_customer
  from customer_profiles
  where from_demo_id = p_demo_id
  limit 1;

  if v_existing_customer is not null then
    raise exception 'demo_already_converted';
  end if;

  v_monthly_price := coalesce(v_demo.proposed_price_ore / 100, 0);
  v_pricing_status := case when v_demo.proposed_price_ore is null then 'unknown' else 'fixed' end;

  insert into customer_profiles (
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

  update demos
  set status = 'won',
      owner_admin_id = coalesce(owner_admin_id, p_owner_admin_id),
      status_changed_at = now(),
      responded_at = coalesce(responded_at, now()),
      resolved_at = now()
  where id = p_demo_id;

  insert into admin_idempotency_keys(key, operation, customer_id, demo_id, created_at)
  values (p_idempotency_key, 'demo.convert', v_customer_id, p_demo_id, now());

  return query select v_customer_id, p_demo_id, false;
end;
$$;

grant execute on function public.admin_convert_demo_to_customer(uuid, uuid, int, date, text) to authenticated;

create or replace view public.v_admin_payroll_period as
select
  to_char(date_trunc('month', ili.period_start), 'YYYY-MM') as period_key,
  trim(to_char(date_trunc('month', ili.period_start), 'Mon YYYY')) as period_label,
  date_trunc('month', ili.period_start)::date as period_start,
  (date_trunc('month', ili.period_start) + interval '1 month - 1 day')::date as period_end,
  inv.customer_profile_id as customer_id,
  cp.business_name as customer_name,
  cm.id as cm_id,
  cm.name as cm_name,
  cm.email as cm_email,
  cm.commission_rate,
  sum(
    round(
      ili.amount::numeric * greatest(
        0,
        least(
          coalesce((ca.valid_to + interval '1 day')::date, ili.period_end::date),
          ili.period_end::date
        ) - greatest(ca.valid_from::date, ili.period_start::date)
      )::numeric
      / nullif(greatest((ili.period_end::date - ili.period_start::date), 1), 0)
    )
  )::bigint as billed_ore,
  sum(
    greatest(
      0,
      least(
        coalesce((ca.valid_to + interval '1 day')::date, ili.period_end::date),
        ili.period_end::date
      ) - greatest(ca.valid_from::date, ili.period_start::date)
    )
  )::int as billable_days
from public.invoice_line_items ili
join public.invoices inv
  on inv.stripe_invoice_id = ili.stripe_invoice_id
join public.customer_profiles cp
  on cp.id = inv.customer_profile_id
join public.cm_assignments ca
  on ca.customer_id = inv.customer_profile_id
 and ca.valid_from::date < ili.period_end::date
 and coalesce((ca.valid_to + interval '1 day')::date, ili.period_end::date) > ili.period_start::date
join public.team_members cm
  on cm.id = ca.cm_id
where inv.status in ('paid', 'open')
  and ili.period_start is not null
  and ili.period_end is not null
  and ili.amount > 0
group by
  1, 2, 3, 4,
  inv.customer_profile_id,
  cp.business_name,
  cm.id,
  cm.name,
  cm.email,
  cm.commission_rate;
