begin;

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.service_costs
  add column if not exists metadata jsonb;

alter table public.stripe_sync_log
  add column if not exists stripe_event_id text,
  add column if not exists object_type text,
  add column if not exists object_id text,
  add column if not exists sync_direction text,
  add column if not exists payload_summary jsonb,
  add column if not exists environment text not null default 'test';

create index if not exists idx_ssl_created on public.stripe_sync_log (created_at desc);
create index if not exists idx_ssl_status on public.stripe_sync_log (status, created_at desc);
create index if not exists idx_ssl_event_type on public.stripe_sync_log (event_type);

-- TikTok customer OAuth was removed from the final architecture.
-- Fresh installs use verified profile URL + provider sync, so no token
-- table is created in the canonical schema.

commit;
