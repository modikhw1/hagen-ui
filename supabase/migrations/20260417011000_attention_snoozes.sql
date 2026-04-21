begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'attention_subject_type') then
    create type public.attention_subject_type as enum (
      'invoice',
      'onboarding',
      'cm_notification',
      'customer_blocking',
      'demo_response'
    );
  end if;
end $$;

create table if not exists public.attention_snoozes (
  id uuid primary key default gen_random_uuid(),
  subject_type public.attention_subject_type not null,
  subject_id text not null,
  snoozed_until timestamptz,
  note text,
  snoozed_by_admin_id uuid not null references public.team_members(id),
  snoozed_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text check (release_reason in ('expired', 'escalated', 'manual') or release_reason is null)
);

create unique index if not exists attention_snoozes_active_unique
  on public.attention_snoozes (subject_type, subject_id)
  where released_at is null;

alter table public.attention_snoozes enable row level security;

drop policy if exists "attention_snoozes_admin_all" on public.attention_snoozes;
create policy "attention_snoozes_admin_all" on public.attention_snoozes
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

commit;
