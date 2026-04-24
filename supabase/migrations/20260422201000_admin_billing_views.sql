begin;

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

commit;
