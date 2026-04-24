begin;

alter table public.invoices
  add column if not exists subtotal_ore integer not null default 0,
  add column if not exists tax_ore integer not null default 0,
  add column if not exists total_ore integer not null default 0,
  add column if not exists invoice_number text,
  add column if not exists payment_intent_id text,
  add column if not exists dispute_status text;

update public.invoices
set
  subtotal_ore = greatest(coalesce(subtotal_ore, 0), 0),
  tax_ore = greatest(coalesce(tax_ore, 0), 0),
  total_ore = case
    when coalesce(total_ore, 0) > 0 then total_ore
    else greatest(coalesce(amount_paid, 0), coalesce(amount_due, 0))
  end
where true;

create index if not exists idx_invoices_env_created
  on public.invoices (environment, created_at desc);

create index if not exists idx_invoices_customer
  on public.invoices (customer_profile_id);

create index if not exists idx_subs_env_created
  on public.subscriptions (environment, created desc);

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
  end as display_status,
  i.currency,
  i.subtotal_ore,
  i.tax_ore,
  i.total_ore,
  i.invoice_number,
  coalesce(i.payment_intent_id, refund_pi.payment_intent_id) as payment_intent_id,
  coalesce(i.dispute_status, case when i.status = 'uncollectible' then 'uncollectible' else null end) as dispute_status
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
) r on r.stripe_invoice_id = i.stripe_invoice_id
left join lateral (
  select max(stripe_payment_intent_id) as payment_intent_id
  from public.stripe_refunds sr
  where sr.stripe_invoice_id = i.stripe_invoice_id
) refund_pi on true;

grant select on public.v_admin_invoices to authenticated, service_role;

commit;
