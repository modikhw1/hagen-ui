'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowDownAZ, ArrowUpAZ, Search } from 'lucide-react';
import AdminAvatar from '@/components/admin/AdminAvatar';
import InviteCustomerModal from '@/components/admin/customers/InviteCustomerModal';
import { customerStatusConfig } from '@/lib/admin/labels';
import { shortDateSv } from '@/lib/admin/time';
import type { AdminCustomerListItem, AdminTeamOption, CustomerListFilter, CustomerListSort } from '@/lib/admin/customers/list.server';

function buildListUrl(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function onboardingLabel(state: AdminCustomerListItem['onboardingState']) {
  if (state === 'cm_ready') return 'CM-redo';
  if (state === 'live') return 'Live';
  if (state === 'settled') return 'Stabil';
  return 'Inviterad';
}

function onboardingTone(
  state: AdminCustomerListItem['onboardingState'],
  needsAttention: boolean,
): 'info' | 'warning' | 'success' {
  if (state === 'live' || state === 'settled') return 'success';
  if (state === 'cm_ready' && needsAttention) return 'warning';
  return 'info';
}

function bufferLabel(status: AdminCustomerListItem['bufferStatus']) {
  if (status === 'ok') return 'Buffer ok';
  if (status === 'thin') return 'Tunn buffer';
  if (status === 'under') return 'Underfylld';
  if (status === 'blocked') return 'Buffrad men blockerad';
  return 'Pausad';
}

function bufferTone(
  status: AdminCustomerListItem['bufferStatus'],
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'ok') return 'success';
  if (status === 'thin') return 'warning';
  if (status === 'under') return 'danger';
  if (status === 'blocked') return 'warning';
  return 'neutral';
}

function blockingLabel(state: AdminCustomerListItem['blocking']['state']) {
  return state === 'escalated' ? 'Eskalerad' : 'Blockerad';
}

export default function CustomersPageClient({
  rows,
  total,
  page,
  totalPages,
  search,
  filter,
  sort,
  team,
}: {
  rows: AdminCustomerListItem[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  filter: CustomerListFilter;
  sort: CustomerListSort;
  team: AdminTeamOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [showInvite, setShowInvite] = useState(false);
  const pageStart = total === 0 ? 0 : (page - 1) * 25 + 1;
  const pageEnd = Math.min(total, page * 25);
  const cmByName = new Map<string, AdminTeamOption>();

  team.forEach((member) => {
    cmByName.set(member.name.toLowerCase(), member);
    if (member.email) {
      cmByName.set(member.email.toLowerCase(), member);
    }
  });

  const updateListParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (filter !== 'all') params.set('filter', filter);
    if (sort === 'oldest') params.set('sort', 'oldest');
    if (page > 1) params.set('page', String(page));

    Object.entries(updates).forEach(([key, value]) => {
      if (value && value.trim().length > 0) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    startTransition(() => {
      router.replace(buildListUrl(pathname || '/admin/customers', params), {
        scroll: false,
      });
    });
  };

  const exportHref = buildListUrl('/api/admin/customers/export', (() => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (filter !== 'all') params.set('filter', filter);
    if (sort === 'oldest') params.set('sort', 'oldest');
    return params;
  })());

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Kunder</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPending ? 'Uppdaterar...' : `${total} kund${total === 1 ? '' : 'er'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={exportHref}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
          >
            Exportera CSV
          </a>
          <button
            onClick={() => setShowInvite(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            + Bjud in kund
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            updateListParams({ q: String(formData.get('q') || '') || null, page: null });
          }}
          className="relative max-w-xs flex-1"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            type="text"
            placeholder="Sok kund..."
            defaultValue={search}
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-4 text-sm outline-none focus:border-primary/30"
          />
        </form>
        <div className="flex gap-0.5 rounded-md bg-secondary p-1">
          {(['all', 'active', 'pipeline', 'archived'] as const).map((key) => (
            <button
              key={key}
              onClick={() => updateListParams({ filter: key === 'all' ? null : key, page: null })}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {key === 'all' ? 'Alla' : key === 'active' ? 'Aktiva' : key === 'pipeline' ? 'Pipeline' : 'Arkiverade'}
            </button>
          ))}
        </div>
        <button
          onClick={() => updateListParams({ sort: sort === 'newest' ? 'oldest' : null, page: null })}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
        >
          {sort === 'newest' ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpAZ className="h-3.5 w-3.5" />}
          Tillagd {sort === 'newest' ? 'nyast forst' : 'aldst forst'}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-4 border-b border-border bg-secondary/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Foretag</div>
          <div>CM</div>
          <div>Pris</div>
          <div>Tillagd</div>
          <div>Status</div>
        </div>

        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Inga kunder hittades.</div>
        ) : (
          rows.map((customer, index) => {
            const cm = customer.account_manager ? cmByName.get(customer.account_manager.toLowerCase()) : undefined;
            const statusConfig = customerStatusConfig(customer.status);

            return (
              <Link
                key={customer.id}
                href={`/admin/customers/${customer.id}`}
                scroll={false}
                className={`grid grid-cols-[2fr_1fr_1fr_1fr_120px] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/30 ${
                  index < rows.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">{customer.business_name}</div>
                  <div className="text-xs text-muted-foreground">{customer.contact_email}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {customer.isNew ? <SignalPill label="Ny" tone="info" /> : null}
                    <SignalPill label={onboardingLabel(customer.onboardingState)} tone={onboardingTone(customer.onboardingState, customer.onboardingNeedsAttention)} />
                    {customer.onboardingNeedsAttention ? (
                      <SignalPill label={`Onboarding fastnat ${customer.onboardingAttentionDays}d`} tone="warning" />
                    ) : null}
                    <SignalPill label={bufferLabel(customer.bufferStatus)} tone={bufferTone(customer.bufferStatus)} />
                    {customer.blocking.state !== 'none' ? (
                      <SignalPill
                        label={`${blockingLabel(customer.blocking.state)} ${customer.blockingDisplayDays}d`}
                        tone={customer.blocking.state === 'escalated' ? 'danger' : 'warning'}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {cm ? (
                    <>
                      <AdminAvatar name={cm.name} avatarUrl={null} size="sm" />
                      <span className="text-sm text-foreground">{cm.name.split(' ')[0]}</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {customer.pricing_status === 'unknown'
                    ? 'Ej satt'
                    : (customer.monthly_price ?? 0) > 0
                      ? `${(customer.monthly_price ?? 0).toLocaleString('sv-SE')} kr`
                      : '—'}
                </div>
                <div className="text-xs text-muted-foreground">{shortDateSv(customer.created_at)}</div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusConfig.className}`}>
                    {statusConfig.label}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {total > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-muted-foreground">
            Visar {pageStart}-{pageEnd} av {total}
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateListParams({ page: page <= 2 ? null : String(page - 1) })}
                disabled={page <= 1}
                className="rounded-md border border-border bg-card px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Forra
              </button>
              <span className="text-muted-foreground">
                Sida {page} av {totalPages}
              </span>
              <button
                type="button"
                onClick={() => updateListParams({ page: String(page + 1) })}
                disabled={page >= totalPages}
                className="rounded-md border border-border bg-card px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Nasta
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <InviteCustomerModal
        open={showInvite}
        team={team}
        onClose={() => setShowInvite(false)}
        onCreated={async () => {
          setShowInvite(false);
          startTransition(() => router.refresh());
        }}
      />
    </div>
  );
}

function SignalPill({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}) {
  const className =
    tone === 'success'
      ? 'bg-success/10 text-success'
      : tone === 'warning'
        ? 'bg-warning/10 text-warning'
        : tone === 'danger'
          ? 'bg-destructive/10 text-destructive'
          : tone === 'info'
            ? 'bg-info/10 text-info'
            : 'bg-secondary text-muted-foreground';

  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}>{label}</span>;
}
