-- Phase 26a: Ingest Engine Foundation
-- Creates public.ingest_runs to track upload/ingest lifecycle for studio concepts.
-- Status model: queued → running → ready_for_review / completed / failed / canceled
-- Access is via api-server (service role). Direct anon/authenticated access is blocked.

create table if not exists public.ingest_runs (
  id                      uuid primary key default gen_random_uuid(),
  source                  text not null default 'studio_upload',
  source_url              text not null,
  platform                text null,
  status                  text not null default 'queued'
                            check (status in ('queued', 'running', 'ready_for_review', 'completed', 'failed', 'canceled')),
  stage                   text null,
  created_by              uuid null references public.profiles(id),
  customer_profile_id     uuid null references public.customer_profiles(id),
  concept_id              text null references public.concepts(id),
  hagen_contract_version  text null,
  hagen_video_id          text null,
  hagen_request_id        text null,
  input                   jsonb not null default '{}',
  result                  jsonb not null default '{}',
  warnings                jsonb not null default '[]',
  error_code              text null,
  error_message           text null,
  started_at              timestamptz null,
  finished_at             timestamptz null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists ingest_runs_created_by_at
  on public.ingest_runs (created_by, created_at desc);

create index if not exists ingest_runs_status_at
  on public.ingest_runs (status, created_at desc);

create index if not exists ingest_runs_concept_id
  on public.ingest_runs (concept_id)
  where concept_id is not null;

create index if not exists ingest_runs_customer_profile_id
  on public.ingest_runs (customer_profile_id)
  where customer_profile_id is not null;

-- RLS: enabled, direct anon/authenticated access blocked.
-- All access via api-server using service role key.
alter table public.ingest_runs enable row level security;

-- Block anon
create policy "ingest_runs_deny_anon"
  on public.ingest_runs
  as restrictive
  for all
  to anon
  using (false);

-- Block authenticated direct access (service role bypasses RLS)
create policy "ingest_runs_deny_authenticated"
  on public.ingest_runs
  as restrictive
  for all
  to authenticated
  using (false);
