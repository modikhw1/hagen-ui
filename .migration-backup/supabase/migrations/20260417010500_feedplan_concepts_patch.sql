begin;

create table if not exists public.feedplan_concepts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  title text,
  body jsonb,
  created_by_cm_id uuid references public.team_members(id) on delete set null,
  planned_publish_date date,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feedplan_concepts
  add column if not exists planned_publish_date date,
  add column if not exists status text not null default 'draft',
  add column if not exists updated_at timestamptz not null default now();

alter table public.feedplan_concepts
  drop constraint if exists feedplan_concepts_status_check;
alter table public.feedplan_concepts
  add constraint feedplan_concepts_status_check
  check (status in ('draft', 'ready', 'published', 'skipped'));

create index if not exists feedplan_concepts_buffer_idx
  on public.feedplan_concepts (customer_id, planned_publish_date)
  where status in ('draft', 'ready');

alter table public.feedplan_concepts enable row level security;

drop policy if exists "feedplan_concepts_admin_all" on public.feedplan_concepts;
create policy "feedplan_concepts_admin_all" on public.feedplan_concepts
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "feedplan_concepts_assigned_cm_all" on public.feedplan_concepts;
create policy "feedplan_concepts_assigned_cm_all" on public.feedplan_concepts
for all to authenticated
using (
  public.has_role(auth.uid(), 'content_manager')
  and exists (
    select 1
    from public.customer_profiles cp
    join public.team_members tm on tm.profile_id = auth.uid()
    where cp.id = feedplan_concepts.customer_id
      and (
        cp.account_manager_profile_id = auth.uid()
        or lower(coalesce(cp.account_manager, '')) = lower(coalesce(tm.email, ''))
        or lower(coalesce(cp.account_manager, '')) = lower(coalesce(tm.name, ''))
      )
  )
)
with check (
  public.has_role(auth.uid(), 'content_manager')
  and exists (
    select 1
    from public.customer_profiles cp
    join public.team_members tm on tm.profile_id = auth.uid()
    where cp.id = feedplan_concepts.customer_id
      and (
        cp.account_manager_profile_id = auth.uid()
        or lower(coalesce(cp.account_manager, '')) = lower(coalesce(tm.email, ''))
        or lower(coalesce(cp.account_manager, '')) = lower(coalesce(tm.name, ''))
      )
  )
);

drop trigger if exists trg_feedplan_concepts_updated_at on public.feedplan_concepts;
create trigger trg_feedplan_concepts_updated_at
before update on public.feedplan_concepts
for each row execute function public.set_updated_at();

commit;
