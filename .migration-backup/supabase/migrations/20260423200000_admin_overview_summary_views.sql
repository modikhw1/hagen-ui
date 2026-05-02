create or replace view public.v_admin_service_costs_30d as
select
  coalesce(service, 'Okänd') as service,
  coalesce(sum(calls), 0)::bigint as calls_30d,
  coalesce(round(sum(cost_sek * 100)), 0)::bigint as cost_30d,
  coalesce(
    array_agg(coalesce(round(cost_sek * 100), 0)::bigint order by date),
    array[]::bigint[]
  ) as trend
from public.service_costs
where date >= current_date - interval '30 days'
  and lower(coalesce(service, '')) <> 'resend'
group by coalesce(service, 'Okänd');

create or replace view public.v_admin_subscription_summary as
with subscriptions as (
  select
    coalesce(status, '') as status,
    coalesce(amount, 0)::bigint as amount,
    created::timestamptz as created_at,
    canceled_at::timestamptz as canceled_at
  from public.v_admin_subscriptions
)
select
  coalesce(
    sum(
      case
        when status in ('active', 'trialing', 'past_due')
          and (canceled_at is null or canceled_at > now())
          then amount
        else 0
      end
    ),
    0
  )::bigint as mrr_now_ore,
  coalesce(
    sum(
      case
        when status in ('active', 'trialing', 'past_due')
          and created_at <= now() - interval '30 days'
          and (canceled_at is null or canceled_at > now() - interval '30 days')
          then amount
        else 0
      end
    ),
    0
  )::bigint as mrr_30d_ago_ore
from subscriptions;
