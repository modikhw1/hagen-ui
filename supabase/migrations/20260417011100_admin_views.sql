begin;

create or replace view public.v_customer_buffer as
select
  c.id as customer_id,
  c.account_manager_profile_id as assigned_cm_id,
  c.concepts_per_week,
  c.paused_until,
  (
    select max(fc.planned_publish_date)
    from public.feedplan_concepts fc
    where fc.customer_id = c.id
      and fc.status in ('draft', 'ready')
  ) as latest_planned_publish_date,
  (
    select max(tp.published_at)
    from public.tiktok_publications tp
    where tp.customer_id = c.id
  ) as last_published_at
from public.customer_profiles c
where c.status <> 'archived';

create or replace view public.v_cm_interactions_7d as
select
  cm_id,
  count(*)::int as cnt
from public.cm_interactions
where created_at >= now() - interval '7 days'
group by cm_id;

commit;
