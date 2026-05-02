alter table public.customer_concepts
  add column if not exists reconciled_customer_concept_id uuid null,
  add column if not exists reconciled_by_cm_id uuid null,
  add column if not exists reconciled_at timestamptz null;

alter table public.customer_concepts
  drop constraint if exists customer_concepts_reconciled_customer_concept_id_fkey;

alter table public.customer_concepts
  add constraint customer_concepts_reconciled_customer_concept_id_fkey
  foreign key (reconciled_customer_concept_id)
  references public.customer_concepts (id)
  on delete set null;

alter table public.customer_concepts
  drop constraint if exists customer_concepts_reconciled_by_cm_id_fkey;

alter table public.customer_concepts
  add constraint customer_concepts_reconciled_by_cm_id_fkey
  foreign key (reconciled_by_cm_id)
  references public.profiles (id)
  on delete set null;

create index if not exists idx_customer_concepts_reconciled_customer_concept_id
  on public.customer_concepts (reconciled_customer_concept_id);
