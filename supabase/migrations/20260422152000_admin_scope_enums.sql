begin;

alter type public.admin_role add value if not exists 'billing.invoices.read';
alter type public.admin_role add value if not exists 'billing.invoices.write';
alter type public.admin_role add value if not exists 'billing.subscriptions.read';
alter type public.admin_role add value if not exists 'billing.subscriptions.write';
alter type public.admin_role add value if not exists 'billing.health.read';
alter type public.admin_role add value if not exists 'billing.health.retry';
alter type public.admin_role add value if not exists 'team.read';
alter type public.admin_role add value if not exists 'team.write';
alter type public.admin_role add value if not exists 'team.archive';
alter type public.admin_role add value if not exists 'team.absences.write';
alter type public.admin_role add value if not exists 'overview.read';

commit;
