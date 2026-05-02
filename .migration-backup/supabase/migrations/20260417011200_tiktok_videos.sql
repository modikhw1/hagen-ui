create table if not exists public.tiktok_videos (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null references public.customer_profiles(id) on delete cascade,
  video_id text not null,
  uploaded_at timestamptz not null,
  views bigint not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  shares int not null default 0,
  cover_image_url text,
  share_url text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_profile_id, video_id)
);

create index if not exists idx_tiktok_videos_customer_uploaded
  on public.tiktok_videos (customer_profile_id, uploaded_at desc);

alter table public.tiktok_videos enable row level security;

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

drop trigger if exists trg_tiktok_videos_updated_at on public.tiktok_videos;
create trigger trg_tiktok_videos_updated_at
before update on public.tiktok_videos
for each row
execute function public.set_updated_at();
