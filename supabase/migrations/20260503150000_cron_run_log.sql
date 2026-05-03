-- Per-invocation aggregate log for the TikTok sync cron. Each call to
-- POST /api/studio-v2/internal/sync-history-all writes one row here so the
-- admin cron-health view can show "latest cron runs" with the requested
-- processed/errors/callsUsed summary, separately from per-customer sync_runs.
create table if not exists public.cron_run_log (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed integer not null default 0,
  imported integer not null default 0,
  stats_updated integer not null default 0,
  calls_used integer not null default 0,
  budget_remaining integer not null default 0,
  budget_exceeded boolean not null default false,
  stale_locks_cleared integer not null default 0,
  errors jsonb
);

create index if not exists idx_cron_run_log_started_at
  on public.cron_run_log(started_at desc);

alter table public.cron_run_log enable row level security;

-- Only admins/CMs may read. Inserts come from the service role (api-server),
-- which bypasses RLS, so no insert policy is needed.
drop policy if exists cron_run_log_staff_select on public.cron_run_log;
create policy cron_run_log_staff_select on public.cron_run_log
  for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'content_manager'::app_role));