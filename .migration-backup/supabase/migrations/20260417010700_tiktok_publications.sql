begin;

create table if not exists public.tiktok_publications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  tiktok_video_id text not null,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  unique (customer_id, tiktok_video_id)
);

create index if not exists tiktok_publications_customer_time_idx
  on public.tiktok_publications (customer_id, published_at desc);

alter table public.tiktok_publications enable row level security;

drop policy if exists "tiktok_publications_admin_or_assigned_select" on public.tiktok_publications;
create policy "tiktok_publications_admin_or_assigned_select" on public.tiktok_publications
for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or exists (
    select 1
    from public.customer_profiles cp
    join public.team_members tm on tm.profile_id = auth.uid()
    where cp.id = tiktok_publications.customer_id
      and (
        cp.account_manager_profile_id = auth.uid()
        or lower(coalesce(cp.account_manager, '')) = lower(coalesce(tm.email, ''))
        or lower(coalesce(cp.account_manager, '')) = lower(coalesce(tm.name, ''))
      )
  )
);

commit;
