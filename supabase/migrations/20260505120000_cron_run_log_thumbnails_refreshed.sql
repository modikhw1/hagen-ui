-- Add thumbnails_refreshed counter to cron_run_log so the admin cron-health
-- view can show how many reconciled assignment thumbnails were corrected per
-- cron invocation by the refreshReconciledThumbnails pass.
alter table public.cron_run_log
  add column if not exists thumbnails_refreshed integer not null default 0;
