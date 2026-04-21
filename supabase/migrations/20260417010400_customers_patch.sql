begin;

alter table public.customer_profiles
  add column if not exists tiktok_profile_pic_url text,
  add column if not exists tiktok_profile_synced_at timestamptz,
  add column if not exists concepts_per_week smallint not null default 3,
  add column if not exists paused_until date,
  add column if not exists onboarding_state text not null default 'invited',
  add column if not exists onboarding_state_changed_at timestamptz not null default now(),
  add column if not exists from_demo_id uuid;

alter table public.customer_profiles
  drop constraint if exists customer_profiles_concepts_per_week_check;
alter table public.customer_profiles
  add constraint customer_profiles_concepts_per_week_check
  check (concepts_per_week between 1 and 5);

alter table public.customer_profiles
  drop constraint if exists customer_profiles_onboarding_state_check;
alter table public.customer_profiles
  add constraint customer_profiles_onboarding_state_check
  check (onboarding_state in ('invited', 'cm_ready', 'live', 'settled'));

create index if not exists customer_profiles_onboarding_state_idx
  on public.customer_profiles (onboarding_state)
  where onboarding_state <> 'settled';

create index if not exists customer_profiles_paused_until_idx
  on public.customer_profiles (paused_until)
  where paused_until is not null;

create or replace function public.touch_onboarding_state_changed_at()
returns trigger
language plpgsql
as $$
begin
  if new.onboarding_state is distinct from old.onboarding_state then
    new.onboarding_state_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_profiles_onboarding_state on public.customer_profiles;
create trigger trg_customer_profiles_onboarding_state
before update on public.customer_profiles
for each row execute function public.touch_onboarding_state_changed_at();

commit;
