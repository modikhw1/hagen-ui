-- 022_reconcile_live_customer_workspace_schema.sql
-- Reconciles live Supabase schema with the customer workspace contracts used
-- by the app after the feed-first / notes-first / game-plan split.
--
-- Why this exists:
-- - Live migration history does not show the local 021 migration lineage.
-- - Live schema is missing public.customer_game_plans entirely.
-- - Live public.customer_notes is still on the legacy shape.
--
-- This migration is intentionally idempotent so it can be applied safely to
-- environments that already have part of the schema.

create table if not exists public.customer_game_plans (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customer_profiles(id) on delete cascade,
  html text not null default '',
  plain_text text not null default '',
  editor_version integer not null default 1,
  updated_by uuid null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_game_plans enable row level security;

drop policy if exists "Admins and CMs can view customer_game_plans" on public.customer_game_plans;
drop policy if exists "Admins and CMs can manage customer_game_plans" on public.customer_game_plans;
drop policy if exists "Customers can view their own customer_game_plans" on public.customer_game_plans;

create policy "Admins and CMs can view customer_game_plans"
  on public.customer_game_plans for select
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'content_manager')
    )
  );

create policy "Admins and CMs can manage customer_game_plans"
  on public.customer_game_plans for all
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'content_manager')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'content_manager')
    )
  );

create policy "Customers can view their own customer_game_plans"
  on public.customer_game_plans for select
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.matching_data->>'customer_profile_id' = customer_game_plans.customer_id::text
    )
  );

alter table public.customer_notes
  add column if not exists content_html text null,
  add column if not exists note_type text not null default 'update',
  add column if not exists primary_customer_concept_id uuid null references public.customer_concepts(id) on delete set null,
  add column if not exists "references" jsonb not null default '[]'::jsonb,
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.customer_concepts
  add column if not exists tiktok_thumbnail_url text null,
  add column if not exists tiktok_views integer null,
  add column if not exists tiktok_likes integer null,
  add column if not exists tiktok_comments integer null,
  add column if not exists tiktok_watch_time_seconds integer null,
  add column if not exists tiktok_last_synced_at timestamptz null,
  add column if not exists planned_publish_at timestamptz null,
  add column if not exists content_loaded_at timestamptz null,
  add column if not exists content_loaded_seen_at timestamptz null,
  add column if not exists published_at timestamptz null;

insert into public.customer_game_plans (
  customer_id,
  html,
  plain_text,
  editor_version,
  updated_at
)
select
  cp.id,
  cp.game_plan->>'html',
  trim(
    regexp_replace(
      regexp_replace(cp.game_plan->>'html', '<[^>]+>', ' ', 'g'),
      '\s+',
      ' ',
      'g'
    )
  ),
  coalesce(nullif(cp.game_plan->>'version', '')::integer, 1),
  coalesce(nullif(cp.game_plan->>'updated_at', '')::timestamptz, now())
from public.customer_profiles cp
where jsonb_typeof(cp.game_plan) = 'object'
  and nullif(trim(cp.game_plan->>'html'), '') is not null
on conflict (customer_id) do update
set
  html = excluded.html,
  plain_text = excluded.plain_text,
  editor_version = excluded.editor_version,
  updated_at = excluded.updated_at;
