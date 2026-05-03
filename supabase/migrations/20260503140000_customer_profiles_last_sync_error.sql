-- Add last_sync_error column so the admin cron-health view can surface
-- per-customer failure messages from the TikTok history sync.
alter table public.customer_profiles
  add column if not exists last_sync_error text;

-- Track RapidAPI calls per sync_run so the cron batch can enforce a true
-- per-day budget across multiple invocations.
alter table public.sync_runs
  add column if not exists calls_used integer default 0;
