begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cm_notification_priority') then
    create type public.cm_notification_priority as enum ('normal', 'urgent');
  end if;
end $$;

create table if not exists public.cm_notifications (
  id uuid primary key default gen_random_uuid(),
  from_cm_id uuid not null references public.team_members(id) on delete cascade,
  customer_id uuid references public.customer_profiles(id) on delete set null,
  message text not null,
  priority public.cm_notification_priority not null default 'normal',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_admin_id uuid references public.team_members(id),
  resolution_note text
);

create index if not exists cm_notifications_open_idx
  on public.cm_notifications (resolved_at, priority, created_at desc)
  where resolved_at is null;

alter table public.cm_notifications enable row level security;

drop policy if exists "cm_notifications_cm_insert" on public.cm_notifications;
create policy "cm_notifications_cm_insert" on public.cm_notifications
for insert to authenticated
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.id = cm_notifications.from_cm_id
      and tm.profile_id = auth.uid()
  )
);

drop policy if exists "cm_notifications_cm_select_own" on public.cm_notifications;
create policy "cm_notifications_cm_select_own" on public.cm_notifications
for select to authenticated
using (
  exists (
    select 1
    from public.team_members tm
    where tm.id = cm_notifications.from_cm_id
      and tm.profile_id = auth.uid()
  )
  or public.has_role(auth.uid(), 'admin')
);

drop policy if exists "cm_notifications_admin_update" on public.cm_notifications;
create policy "cm_notifications_admin_update" on public.cm_notifications
for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

commit;
