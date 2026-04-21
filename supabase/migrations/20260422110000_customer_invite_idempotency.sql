begin;

alter table public.customer_profiles
  add column if not exists invite_attempt_nonce bigint not null default 0;

create table if not exists public.pending_stripe_attachments (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null references public.customer_profiles(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_product_id text,
  stripe_price_id text,
  reason text not null default 'profile_update_failed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pending_stripe_attachments_reason_check check (
    reason in ('profile_update_failed', 'invite_recovery', 'manual_repair')
  )
);

create index if not exists pending_stripe_attachments_customer_idx
  on public.pending_stripe_attachments (customer_profile_id, created_at desc);

alter table public.pending_stripe_attachments enable row level security;

drop policy if exists "pending_stripe_attachments_admin_manage" on public.pending_stripe_attachments;
create policy "pending_stripe_attachments_admin_manage" on public.pending_stripe_attachments
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_pending_stripe_attachments_updated_at on public.pending_stripe_attachments;
create trigger trg_pending_stripe_attachments_updated_at
before update on public.pending_stripe_attachments
for each row execute function public.set_updated_at();

commit;
