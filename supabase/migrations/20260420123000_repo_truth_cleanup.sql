begin;

-- Reassert the canonical RBAC model and final TikTok provider-based schema.
-- This keeps existing databases aligned even if older transitional
-- migrations were already applied before the repo was cleaned up.

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role = _role
  )
$$;

drop policy if exists "tt_videos_admin_or_assigned_select" on public.tiktok_videos;
create policy "tt_videos_admin_or_assigned_select" on public.tiktok_videos
for select to authenticated
using (
  exists (
    select 1
    from public.customer_profiles cp
    where cp.id = tiktok_videos.customer_profile_id
      and (
        public.has_role(auth.uid(), 'admin')
        or (
          public.has_role(auth.uid(), 'content_manager')
          and cp.account_manager_profile_id = auth.uid()
        )
        or (
          public.has_role(auth.uid(), 'customer')
          and cp.user_id = auth.uid()
        )
      )
  )
);

update public.customer_profiles
set discount_type = 'free_months'
where discount_type = 'free_period';

alter table public.customer_profiles
  drop constraint if exists customer_profiles_discount_type_check;

alter table public.customer_profiles
  add constraint customer_profiles_discount_type_check
  check (
    discount_type is null
    or discount_type in ('none', 'percent', 'amount', 'free_months')
  );

drop trigger if exists trg_tt_tokens_updated_at on public.tiktok_oauth_tokens;
drop policy if exists "tt_tokens_no_client" on public.tiktok_oauth_tokens;
drop table if exists public.tiktok_oauth_tokens cascade;

commit;
