begin;

create table if not exists public.stripe_credit_notes (
  id uuid primary key default gen_random_uuid(),
  stripe_credit_note_id text not null unique,
  stripe_invoice_id text,
  stripe_customer_id text,
  customer_profile_id uuid references public.customer_profiles(id) on delete set null,
  total integer not null default 0,
  refund_amount integer not null default 0,
  credit_amount integer not null default 0,
  out_of_band_amount integer not null default 0,
  currency text not null default 'sek',
  reason text,
  memo text,
  status text not null default 'issued',
  effective_at timestamptz,
  raw jsonb,
  environment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_refunds (
  id uuid primary key default gen_random_uuid(),
  stripe_refund_id text not null unique,
  stripe_charge_id text,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  stripe_customer_id text,
  customer_profile_id uuid references public.customer_profiles(id) on delete set null,
  amount integer not null default 0,
  currency text not null default 'sek',
  reason text,
  status text not null default 'pending',
  raw jsonb,
  environment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_credit_notes_invoice_idx
  on public.stripe_credit_notes (stripe_invoice_id, created_at desc);

create index if not exists stripe_credit_notes_customer_idx
  on public.stripe_credit_notes (customer_profile_id, created_at desc);

create index if not exists stripe_refunds_invoice_idx
  on public.stripe_refunds (stripe_invoice_id, created_at desc);

create index if not exists stripe_refunds_customer_idx
  on public.stripe_refunds (customer_profile_id, created_at desc);

create index if not exists cm_assignments_scheduled_change_effective_idx
  on public.cm_assignments (((scheduled_change ->> 'effective_date')))
  where scheduled_change is not null;

alter table public.stripe_credit_notes enable row level security;
alter table public.stripe_refunds enable row level security;

drop policy if exists "stripe_credit_notes_admin_read" on public.stripe_credit_notes;
create policy "stripe_credit_notes_admin_read" on public.stripe_credit_notes
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "stripe_refunds_admin_read" on public.stripe_refunds;
create policy "stripe_refunds_admin_read" on public.stripe_refunds
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_stripe_credit_notes_updated_at on public.stripe_credit_notes;
create trigger trg_stripe_credit_notes_updated_at
before update on public.stripe_credit_notes
for each row execute function public.set_updated_at();

drop trigger if exists trg_stripe_refunds_updated_at on public.stripe_refunds;
create trigger trg_stripe_refunds_updated_at
before update on public.stripe_refunds
for each row execute function public.set_updated_at();

commit;
