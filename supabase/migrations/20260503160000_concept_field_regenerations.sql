-- Task #15 Step 6: history of AI regenerations of concept fields.
-- Each row is one model call for one (concept, field) pair so we can show
-- side-by-side outputs in the review UI and learn from CM picks later.

create table if not exists public.concept_field_regenerations (
  id uuid primary key default gen_random_uuid(),
  concept_id text not null references public.concepts(id) on delete cascade,
  field text not null
    check (field in ('headline_sv', 'description_sv', 'whyItWorks_sv', 'script_sv')),
  model text not null,
  prompt_version text not null default 'v1',
  output text not null,
  output_chars integer generated always as (length(output)) stored,
  was_picked boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists concept_field_regenerations_concept_idx
  on public.concept_field_regenerations (concept_id, field, created_at desc);

alter table public.concept_field_regenerations enable row level security;

-- CMs and admins can read and write; customers see nothing.
drop policy if exists concept_field_regenerations_cm_read on public.concept_field_regenerations;
create policy concept_field_regenerations_cm_read
  on public.concept_field_regenerations
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'content_manager')
    )
  );

drop policy if exists concept_field_regenerations_cm_write on public.concept_field_regenerations;
create policy concept_field_regenerations_cm_write
  on public.concept_field_regenerations
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'content_manager')
    )
  );

drop policy if exists concept_field_regenerations_cm_update on public.concept_field_regenerations;
create policy concept_field_regenerations_cm_update
  on public.concept_field_regenerations
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'content_manager')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'content_manager')
    )
  );
