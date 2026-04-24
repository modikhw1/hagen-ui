begin;

create table if not exists public.admin_request_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id text not null,
  actor_user_id uuid,
  route text not null,
  action text,
  entity_id text,
  status_code int not null,
  duration_ms int not null
);

create index if not exists admin_request_log_created_at_desc
  on public.admin_request_log (created_at desc);
create index if not exists admin_request_log_route_created_at_desc
  on public.admin_request_log (route, created_at desc);
create index if not exists admin_request_log_actor_created_at_desc
  on public.admin_request_log (actor_user_id, created_at desc);

alter table public.admin_request_log enable row level security;

drop policy if exists "admin_request_log_read_super_admin" on public.admin_request_log;
create policy "admin_request_log_read_super_admin"
  on public.admin_request_log
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "admin_request_log_insert_admin" on public.admin_request_log;
create policy "admin_request_log_insert_admin"
  on public.admin_request_log
  for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.derive_customer_status(
  p_status text,
  p_archived_at timestamptz,
  p_paused_until timestamptz,
  p_invited_at timestamptz,
  p_concepts_per_week int,
  p_latest_planned_publish_date timestamptz,
  p_escalation_flag boolean default false
)
returns text
language sql
stable
as $$
  select
    case
      when p_archived_at is not null or coalesce(p_status, '') = 'archived' then 'archived'
      when coalesce(p_escalation_flag, false) = true then 'escalated'
      when p_paused_until is not null and p_paused_until > now() then 'paused'
      when coalesce(p_status, '') = 'invited' and p_invited_at > now() - interval '14 days' then 'invited_new'
      when coalesce(p_status, '') = 'invited' then 'invited_stale'
      when coalesce(p_status, '') = 'active'
        and (p_concepts_per_week is null or p_latest_planned_publish_date is null or p_latest_planned_publish_date < now())
        then 'live_underfilled'
      when coalesce(p_status, '') = 'active' then 'live_healthy'
      else null
    end::text;
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
    ), '[]'::jsonb),
    'derived_status', public.derive_customer_status(
      cp.status,
      cp.archived_at,
      cp.paused_until,
      cp.invited_at,
      cp.concepts_per_week,
      (
        select vb.latest_planned_publish_date
        from public.v_customer_buffer vb
        where vb.customer_id = cp.id
      ),
      false
    )
  )
  from public.customer_profiles cp
  where cp.id = p_id;
$$;

create table if not exists public.admin_billing_reconcile_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid,
  scope text not null check (scope in ('invoices', 'subscriptions', 'all')),
  environment text not null check (environment in ('live', 'test')),
  since timestamptz null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists admin_billing_reconcile_jobs_created_at_desc
  on public.admin_billing_reconcile_jobs (created_at desc);
create index if not exists admin_billing_reconcile_jobs_status_created_at_desc
  on public.admin_billing_reconcile_jobs (status, created_at desc);

alter table public.admin_billing_reconcile_jobs enable row level security;

drop policy if exists "admin_billing_reconcile_jobs_super_admin_read" on public.admin_billing_reconcile_jobs;
create policy "admin_billing_reconcile_jobs_super_admin_read"
  on public.admin_billing_reconcile_jobs
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "admin_billing_reconcile_jobs_super_admin_write" on public.admin_billing_reconcile_jobs;
create policy "admin_billing_reconcile_jobs_super_admin_write"
  on public.admin_billing_reconcile_jobs
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

alter table public.pending_stripe_attachments
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'reconciled', 'failed')),
  add column if not exists retry_count int not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists reconciled_at timestamptz,
  add column if not exists last_error text;

create index if not exists pending_stripe_attachments_status_created_at_idx
  on public.pending_stripe_attachments (status, created_at desc);
create index if not exists pending_stripe_attachments_next_retry_idx
  on public.pending_stripe_attachments (next_retry_at)
  where status = 'pending';

commit;
