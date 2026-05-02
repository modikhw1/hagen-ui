begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'demo_status') then
    create type public.demo_status as enum ('draft', 'sent', 'opened', 'responded', 'won', 'lost', 'expired');
  end if;
end $$;

create table if not exists public.demos (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  contact_email text,
  tiktok_handle text,
  tiktok_profile_pic_url text,
  proposed_concepts_per_week smallint check (proposed_concepts_per_week between 1 and 5),
  proposed_price_ore integer check (proposed_price_ore is null or proposed_price_ore >= 0),
  preliminary_feedplan jsonb,
  status public.demo_status not null default 'draft',
  status_changed_at timestamptz not null default now(),
  sent_at timestamptz,
  opened_at timestamptz,
  responded_at timestamptz,
  resolved_at timestamptz,
  lost_reason text,
  owner_admin_id uuid references public.team_members(id),
  created_at timestamptz not null default now()
);

create index if not exists demos_status_time_idx
  on public.demos (status, status_changed_at desc);

create or replace function public.touch_demos_status_changed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    if new.status = 'sent' and new.sent_at is null then new.sent_at := now(); end if;
    if new.status = 'opened' and new.opened_at is null then new.opened_at := now(); end if;
    if new.status = 'responded' and new.responded_at is null then new.responded_at := now(); end if;
    if new.status in ('won', 'lost', 'expired') and new.resolved_at is null then new.resolved_at := now(); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_demos_status on public.demos;
create trigger trg_demos_status
before update on public.demos
for each row execute function public.touch_demos_status_changed_at();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_profiles'
      and column_name = 'from_demo_id'
  ) and not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'customer_profiles'
      and constraint_name = 'customer_profiles_from_demo_id_fkey'
  ) then
    alter table public.customer_profiles
      add constraint customer_profiles_from_demo_id_fkey
      foreign key (from_demo_id) references public.demos(id);
  end if;
end $$;

alter table public.demos enable row level security;

drop policy if exists "demos_admin_all" on public.demos;
create policy "demos_admin_all" on public.demos
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

commit;
