-- Audit trail for concept ownership transfers (Ta över)
create table if not exists public.concept_ownership_audit (
  id uuid primary key default gen_random_uuid(),
  concept_id text not null references public.concepts(id) on delete cascade,
  previous_owner uuid,
  new_owner uuid not null,
  actor uuid not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists concept_ownership_audit_concept_idx
  on public.concept_ownership_audit(concept_id, created_at desc);

alter table public.concept_ownership_audit enable row level security;

drop policy if exists concept_ownership_audit_cm_select on public.concept_ownership_audit;
create policy concept_ownership_audit_cm_select
  on public.concept_ownership_audit
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'content_manager')
    )
  );

-- Inserts only via service role (api-server admin client); no anon insert policy.
