begin;

alter table public.customer_profiles
  add column if not exists tiktok_profile_url text,
  add column if not exists tiktok_user_id text,
  add column if not exists last_history_sync_at timestamptz,
  add column if not exists pending_history_advance_at timestamptz,
  add column if not exists operation_lock_until timestamptz;

commit;
