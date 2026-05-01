alter table public.customer_concepts
  add column if not exists history_source text,
  add column if not exists observed_profile_handle text,
  add column if not exists provider_name text,
  add column if not exists provider_video_id text,
  add column if not exists first_observed_at timestamptz,
  add column if not exists last_observed_at timestamptz;

create index if not exists idx_customer_concepts_history_source
  on public.customer_concepts (customer_profile_id, history_source);

create index if not exists idx_customer_concepts_provider_video_id
  on public.customer_concepts (customer_profile_id, provider_video_id)
  where provider_video_id is not null;

comment on column public.customer_concepts.history_source is
  'Provenance for imported or observed TikTok history rows. Expected values include tiktok_profile and hagen_library.';

comment on column public.customer_concepts.observed_profile_handle is
  'Normalized TikTok handle that this history row was observed against when imported.';

comment on column public.customer_concepts.provider_name is
  'Upstream provider identifier used to fetch or import the history row.';

comment on column public.customer_concepts.provider_video_id is
  'Provider-native video identifier when available.';

comment on column public.customer_concepts.first_observed_at is
  'First time this row was observed by LeTrend.';

comment on column public.customer_concepts.last_observed_at is
  'Most recent time this row was observed by LeTrend.';
