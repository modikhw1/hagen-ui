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
