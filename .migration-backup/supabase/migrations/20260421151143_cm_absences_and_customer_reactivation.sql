begin;

create table if not exists public.cm_absences (
  id uuid primary key default gen_random_uuid(),
  cm_id uuid not null references public.team_members(id) on delete cascade,
  customer_profile_id uuid references public.customer_profiles(id) on delete cascade,
  backup_cm_id uuid references public.team_members(id) on delete set null,
  absence_type text not null default 'vacation',
  compensation_mode text not null default 'covering_cm',
  starts_on date not null,
  ends_on date not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cm_absences_valid_range_check check (ends_on >= starts_on),
  constraint cm_absences_type_check check (
    absence_type in ('vacation', 'sick', 'parental_leave', 'training', 'temporary_coverage', 'other')
  ),
  constraint cm_absences_compensation_mode_check check (
    compensation_mode in ('covering_cm', 'primary_cm')
  ),
  constraint cm_absences_self_backup_check check (backup_cm_id is null or backup_cm_id <> cm_id)
);

create index if not exists cm_absences_cm_dates_idx
  on public.cm_absences (cm_id, starts_on desc, ends_on desc);

create index if not exists cm_absences_customer_dates_idx
  on public.cm_absences (customer_profile_id, starts_on desc, ends_on desc)
  where customer_profile_id is not null;

create index if not exists cm_absences_backup_dates_idx
  on public.cm_absences (backup_cm_id, starts_on desc, ends_on desc)
  where backup_cm_id is not null;

alter table public.cm_absences enable row level security;

drop policy if exists "cm_absences_admin_manage" on public.cm_absences;
create policy "cm_absences_admin_manage" on public.cm_absences
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_cm_absences_updated_at on public.cm_absences;
create trigger trg_cm_absences_updated_at
before update on public.cm_absences
for each row execute function public.set_updated_at();

commit;
