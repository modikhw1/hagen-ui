begin;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.team_members enable row level security;
alter table public.cm_activities enable row level security;
alter table public.concepts enable row level security;
alter table public.concept_versions enable row level security;
alter table public.customer_concepts enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_sync_log enable row level security;
alter table public.service_costs enable row level security;
alter table public.tiktok_stats enable row level security;

drop policy if exists "ili_admin_read" on public.invoice_line_items;
create policy "ili_admin_read" on public.invoice_line_items
for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ssl_admin_read" on public.stripe_sync_log;
create policy "ssl_admin_read" on public.stripe_sync_log
for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "sc_admin_read" on public.service_costs;
create policy "sc_admin_read" on public.service_costs
for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- TikTok customer OAuth is intentionally omitted from the canonical schema.

commit;
