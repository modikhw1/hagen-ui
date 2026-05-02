begin;

alter table if exists public.invites enable row level security;

create or replace view public.v_customer_buffer
with (security_invoker = true) as
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

create or replace view public.v_cm_interactions_7d
with (security_invoker = true) as
select
  cm_id,
  count(*)::int as cnt
from public.cm_interactions
where created_at >= now() - interval '7 days'
group by cm_id;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.shift_feed_order(
  p_customer_id uuid,
  p_advance_count integer default 1
)
returns void
language sql
set search_path = public
as $$
  update public.customer_concepts
  set feed_order = feed_order - p_advance_count
  where customer_profile_id = p_customer_id
    and feed_order is not null;
$$;

create or replace function public.swap_feed_order(p_concept_a uuid, p_concept_b uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_order_a integer;
  v_order_b integer;
begin
  select feed_order into v_order_a
  from public.customer_concepts
  where id = p_concept_a
  for update;

  select feed_order into v_order_b
  from public.customer_concepts
  where id = p_concept_b
  for update;

  update public.customer_concepts
  set feed_order = v_order_b
  where id = p_concept_a;

  update public.customer_concepts
  set feed_order = v_order_a
  where id = p_concept_b;
end;
$$;

alter table if exists public.feed_motor_signals enable row level security;

drop policy if exists "staff_all" on public.feed_motor_signals;
drop policy if exists "feed_motor_signals_select" on public.feed_motor_signals;
drop policy if exists "feed_motor_signals_insert" on public.feed_motor_signals;
drop policy if exists "feed_motor_signals_update" on public.feed_motor_signals;
drop policy if exists "feed_motor_signals_delete" on public.feed_motor_signals;

create policy "feed_motor_signals_select" on public.feed_motor_signals
for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'content_manager')
  or (
    public.has_role(auth.uid(), 'customer')
    and exists (
      select 1
      from public.customer_profiles cp
      where cp.id = feed_motor_signals.customer_id
        and cp.user_id = auth.uid()
    )
  )
);

create policy "feed_motor_signals_insert" on public.feed_motor_signals
for insert to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'content_manager')
);

create policy "feed_motor_signals_update" on public.feed_motor_signals
for update to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'content_manager')
);

create policy "feed_motor_signals_delete" on public.feed_motor_signals
for delete to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'content_manager')
);

alter table if exists public.sync_runs enable row level security;

drop policy if exists "staff_all" on public.sync_runs;
drop policy if exists "sync_runs_staff_select" on public.sync_runs;
drop policy if exists "sync_runs_staff_insert" on public.sync_runs;
drop policy if exists "sync_runs_staff_update" on public.sync_runs;
drop policy if exists "sync_runs_staff_delete" on public.sync_runs;

create policy "sync_runs_staff_select" on public.sync_runs
for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'content_manager')
);

create policy "sync_runs_staff_insert" on public.sync_runs
for insert to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'content_manager')
);

create policy "sync_runs_staff_update" on public.sync_runs
for update to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'content_manager')
);

create policy "sync_runs_staff_delete" on public.sync_runs
for delete to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'content_manager')
);

create index if not exists attention_snoozes_snoozed_by_admin_id_idx
  on public.attention_snoozes (snoozed_by_admin_id);

create index if not exists cm_notifications_customer_id_idx
  on public.cm_notifications (customer_id);

create index if not exists cm_notifications_from_cm_id_idx
  on public.cm_notifications (from_cm_id);

create index if not exists cm_notifications_resolved_by_admin_id_idx
  on public.cm_notifications (resolved_by_admin_id);

create index if not exists customer_profiles_user_id_idx
  on public.customer_profiles (user_id);

create index if not exists feedplan_concepts_created_by_cm_id_idx
  on public.feedplan_concepts (created_by_cm_id);

drop index if exists public.idx_customer_profiles_account_manager_profile_id;
drop index if exists public.idx_sync_log_created;
drop index if exists public.idx_sync_log_type;
drop index if exists public.idx_ssl_created;
drop index if exists public.idx_ssl_status;

commit;
