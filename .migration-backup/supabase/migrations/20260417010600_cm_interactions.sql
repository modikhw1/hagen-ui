begin;

create table if not exists public.cm_interactions (
  id uuid primary key default gen_random_uuid(),
  cm_id uuid not null references public.team_members(id) on delete cascade,
  customer_id uuid references public.customer_profiles(id) on delete cascade,
  type text not null check (type in (
    'login',
    'feedplan_edit',
    'concept_added',
    'email_sent',
    'note_added',
    'tiktok_upload_synced'
  )),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cm_interactions_cm_time_idx
  on public.cm_interactions (cm_id, created_at desc);
create index if not exists cm_interactions_customer_time_idx
  on public.cm_interactions (customer_id, created_at desc);
create index if not exists cm_interactions_cm_type_time_idx
  on public.cm_interactions (cm_id, type, created_at desc);

alter table public.cm_interactions enable row level security;

drop policy if exists "cm_interactions_self_select" on public.cm_interactions;
create policy "cm_interactions_self_select" on public.cm_interactions
for select to authenticated
using (
  exists (
    select 1
    from public.team_members tm
    where tm.id = cm_interactions.cm_id
      and tm.profile_id = auth.uid()
  )
  or public.has_role(auth.uid(), 'admin')
);

drop policy if exists "cm_interactions_self_insert" on public.cm_interactions;
create policy "cm_interactions_self_insert" on public.cm_interactions
for insert to authenticated
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.id = cm_interactions.cm_id
      and tm.profile_id = auth.uid()
  )
);

commit;
