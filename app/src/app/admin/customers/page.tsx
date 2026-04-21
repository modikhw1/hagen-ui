'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDownAZ, ArrowUpAZ, Search } from 'lucide-react';
import AdminAvatar from '@/components/admin/AdminAvatar';
import InviteCustomerModal from '@/components/admin/customers/InviteCustomerModal';
import { useCustomers, useTeamMembers } from '@/hooks/admin/useCustomers';
import { customerBufferStatus, type CustomerBufferStatus } from '@/lib/admin-derive/buffer';
import { blockingDisplayDays, customerBlocking, type BlockingState } from '@/lib/admin-derive/blocking';
import { deriveOnboardingState, settleIfDue, type OnboardingState } from '@/lib/admin-derive/onboarding';
import { customerStatusConfig } from '@/lib/admin/labels';
import { shortDateSv } from '@/lib/admin/time';

const FILTERS = [
  { key: 'all', label: 'Alla' },
  { key: 'active', label: 'Aktiva' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'archived', label: 'Arkiverade' },
] as const;

const FILTER_KEYS = new Set(FILTERS.map((filter) => filter.key));
const SCROLL_STATE_PREFIX = 'admin:customers:scroll:';
const PAGE_SIZE = 25;

function normalizeFilter(value: string | null) {
  if (value && FILTER_KEYS.has(value as (typeof FILTERS)[number]['key'])) {
    return value as (typeof FILTERS)[number]['key'];
  }

  return 'all';
}

function normalizeSort(value: string | null) {
  return value === 'oldest' ? 'oldest' : 'newest';
}

function normalizePage(value: string | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function buildCustomersListUrl(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function escapeCsv(value: string | number | null | undefined) {
  if (value == null) return '';
  const normalized = String(value).replace(/"/g, '""');
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
}

function downloadCustomersCsv(rows: ReturnType<typeof buildExportRows>) {
  const header = [
    'Foretag',
    'E-post',
    'Kontaktperson',
    'Status',
    'Onboarding',
    'CM',
    'Prisstatus',
    'MRR_SEK',
    'Intervall',
    'TikTok',
    'Nasta_faktura',
    'Tillagd',
  ];
  const csv = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.businessName,
        row.email,
        row.contactName,
        row.status,
        row.onboardingState,
        row.accountManager,
        row.pricingStatus,
        row.mrrSek,
        row.interval,
        row.tiktokHandle,
        row.nextInvoiceDate,
        row.createdAt,
      ].map(escapeCsv).join(','),
    ),
  ].join('\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
}

function buildExportRows(customers: Array<{
  business_name: string;
  contact_email: string;
  customer_contact_name: string | null;
  status: string;
  onboardingState: string;
  account_manager: string | null;
  pricing_status: string | null;
  monthly_price: number | null;
  subscription_interval?: string | null;
  tiktok_handle: string | null;
  next_invoice_date: string | null;
  created_at: string;
}>) {
  return customers.map((customer) => ({
    businessName: customer.business_name,
    email: customer.contact_email,
    contactName: customer.customer_contact_name || '',
    status: customer.status,
    onboardingState: onboardingLabel(customer.onboardingState as OnboardingState),
    accountManager: customer.account_manager || '',
    pricingStatus: customer.pricing_status === 'unknown' ? 'unknown' : 'fixed',
    mrrSek:
      customer.pricing_status === 'unknown'
        ? ''
        : Math.max(0, Number(customer.monthly_price) || 0),
    interval: customer.subscription_interval || 'month',
    tiktokHandle: customer.tiktok_handle || '',
    nextInvoiceDate: customer.next_invoice_date || '',
    createdAt: customer.created_at,
  }));
}

export default function CustomersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isLoading, refetch } = useCustomers();
  const { data: team = [] } = useTeamMembers();
  const customers = data?.customers;
  const bufferRows = data?.bufferRows;
  const [showInvite, setShowInvite] = useState(false);
  const search = searchParams?.get('q') ?? '';
  const filter = normalizeFilter(searchParams?.get('filter') ?? null);
  const sortByAdded = normalizeSort(searchParams?.get('sort') ?? null);
  const pageFromUrl = normalizePage(searchParams?.get('page') ?? null);
  const currentListUrl = useMemo(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    return buildCustomersListUrl(pathname || '/admin/customers', params);
  }, [pathname, searchParams]);

  const updateListParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');

    Object.entries(updates).forEach(([key, value]) => {
      if (value && value.trim().length > 0) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    router.replace(buildCustomersListUrl(pathname || '/admin/customers', params), {
      scroll: false,
    });
  };

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const storageKey = `${SCROLL_STATE_PREFIX}${currentListUrl}`;
    const storedScroll = window.sessionStorage.getItem(storageKey);
    if (!storedScroll) {
      return;
    }

    const scrollY = Number(storedScroll);
    window.sessionStorage.removeItem(storageKey);
    if (!Number.isFinite(scrollY)) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [currentListUrl, isLoading]);

  const enrichedCustomers = useMemo(() => {
    const today = new Date();
    const customerRows = customers ?? [];
    const customerBufferRows = bufferRows ?? [];
    const bufferByCustomerId = new Map(
      customerBufferRows.map((row) => [row.customer_id, row]),
    );

    return customerRows.map((customer) => {
      const buffer = bufferByCustomerId.get(customer.id);
      const expectedConceptsPerWeek =
        customer.expected_concepts_per_week ?? customer.concepts_per_week ?? 2;
      const blocking = customerBlocking({
        lastPublishedAt: buffer?.last_published_at
          ? new Date(buffer.last_published_at)
          : null,
        activatedAt:
          customer.agreed_at || customer.created_at
            ? new Date(customer.agreed_at || customer.created_at)
            : null,
        isLive:
          customer.status === 'active' ||
          customer.status === 'agreed' ||
          customer.onboarding_state === 'live' ||
          customer.onboarding_state === 'settled',
        pausedUntil: customer.paused_until ? new Date(customer.paused_until) : null,
        today,
      });
      const onboardingChecklist = {
        contractSigned: true,
        contentPlanSet: expectedConceptsPerWeek >= 1,
        startConceptsLoaded: Boolean(buffer?.latest_planned_publish_date),
        tiktokHandleConfirmed: Boolean(customer.tiktok_handle),
        firstPublication: Boolean(buffer?.last_published_at),
      };
      const onboardingState = settleIfDue(
        customer.onboarding_state ?? deriveOnboardingState(onboardingChecklist),
        buffer?.last_published_at ? new Date(buffer.last_published_at) : null,
        today,
      );
      const blockedDays =
        blocking.daysSincePublish === 999
          ? 999
          : Math.max(0, blocking.daysSincePublish);
      const bufferStatus = customerBufferStatus(
        {
          pace: expectedConceptsPerWeek as 1 | 2 | 3 | 4 | 5,
          latestPlannedPublishDate: buffer?.latest_planned_publish_date
            ? new Date(buffer.latest_planned_publish_date)
            : null,
          pausedUntil: customer.paused_until
            ? new Date(customer.paused_until)
            : null,
          today,
        },
        blockedDays,
      );

      return {
        ...customer,
        blocking,
        blockingDisplayDays: blockingDisplayDays(blocking),
        bufferStatus,
        onboardingState,
        onboardingNeedsAttention:
          onboardingState === 'cm_ready' &&
          typeof customer.onboarding_state_changed_at === 'string' &&
          Math.floor(
            (+today - +(new Date(customer.onboarding_state_changed_at))) / 86_400_000,
          ) >= 7,
        onboardingAttentionDays:
          onboardingState === 'cm_ready' &&
          typeof customer.onboarding_state_changed_at === 'string'
            ? Math.max(
                0,
                Math.floor(
                  (+today - +(new Date(customer.onboarding_state_changed_at))) / 86_400_000,
                ),
              )
            : 0,
        isNew: onboardingState !== 'settled',
      };
    });
  }, [bufferRows, customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return enrichedCustomers
      .filter((c) => {
        const matchSearch =
          !q ||
          c.business_name.toLowerCase().includes(q) ||
          c.contact_email.toLowerCase().includes(q);
        const matchStatus =
          filter === 'all' ||
          (filter === 'active' &&
            ['active', 'agreed', 'paused', 'past_due'].includes(c.status)) ||
          (filter === 'pipeline' &&
            (c.status === 'invited' ||
              c.status === 'pending' ||
              c.status === 'pending_payment' ||
              c.status === 'pending_invoice')) ||
          c.status === filter;

        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        const left = new Date(a.created_at).getTime();
        const right = new Date(b.created_at).getTime();
        return sortByAdded === 'newest' ? right - left : left - right;
      });
  }, [enrichedCustomers, search, filter, sortByAdded]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(pageFromUrl, totalPages);
  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(filtered.length, currentPage * PAGE_SIZE);
  const exportRows = useMemo(() => buildExportRows(filtered), [filtered]);
  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filtered]);

  useEffect(() => {
    if (pageFromUrl === currentPage) {
      return;
    }

    updateListParams({ page: currentPage <= 1 ? null : String(currentPage) });
  }, [currentPage, pageFromUrl]);

  const cmByName = useMemo(() => {
    const map = new Map<string, (typeof team)[number]>();

    team.forEach((t) => {
      if (t.name) {
        map.set(t.name.toLowerCase(), t);
      }
      if (t.email) {
        map.set(t.email.toLowerCase(), t);
      }
    });

    return map;
  }, [team]);

  const updatePage = (page: number) => {
    updateListParams({ page: page <= 1 ? null : String(page) });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Kunder
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading
              ? 'Laddar…'
              : `${filtered.length} kund${filtered.length === 1 ? '' : 'er'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadCustomersCsv(exportRows)}
            disabled={exportRows.length === 0}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50"
          >
            Exportera CSV
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            + Bjud in kund
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Sök kund..."
            value={search}
            onChange={(event) =>
              updateListParams({ q: event.target.value || null, page: null })
            }
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-4 text-sm outline-none focus:border-primary/30"
          />
        </div>
        <div className="flex gap-0.5 rounded-md bg-secondary p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() =>
                updateListParams({
                  filter: f.key === 'all' ? null : f.key,
                  page: null,
                })
              }
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() =>
            updateListParams({
              sort: sortByAdded === 'newest' ? 'oldest' : null,
              page: null,
            })
          }
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
        >
          {sortByAdded === 'newest' ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpAZ className="h-3.5 w-3.5" />}
          Tillagd {sortByAdded === 'newest' ? 'nyast först' : 'äldst först'}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-4 border-b border-border bg-secondary/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Företag</div>
          <div>CM</div>
          <div>Pris</div>
          <div>Tillagd</div>
          <div>Status</div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {isLoading ? 'Laddar…' : 'Inga kunder hittades.'}
          </div>
        ) : (
          paginatedCustomers.map((c, i) => {
            const cm = c.account_manager
              ? cmByName.get(c.account_manager.toLowerCase())
              : undefined;
            const sc = customerStatusConfig(c.status);

            return (
              <div
                key={c.id}
                onClick={() => {
                  window.sessionStorage.setItem(
                    `${SCROLL_STATE_PREFIX}${currentListUrl}`,
                    String(window.scrollY),
                  );
                  router.push(`/admin/customers/${c.id}`);
                }}
                className={`grid cursor-pointer grid-cols-[2fr_1fr_1fr_1fr_120px] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/30 ${
                  i < paginatedCustomers.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {c.business_name}
                  </div>
                  <div className="text-xs text-muted-foreground">{c.contact_email}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.isNew ? <SignalPill label="Ny" tone="info" /> : null}
                    <SignalPill
                      label={onboardingLabel(c.onboardingState)}
                      tone={onboardingTone(
                        c.onboardingState,
                        c.onboardingNeedsAttention,
                      )}
                    />
                    {c.onboardingNeedsAttention ? (
                      <SignalPill
                        label={`Onboarding fastnat ${c.onboardingAttentionDays}d`}
                        tone="warning"
                      />
                    ) : null}
                    <SignalPill
                      label={bufferLabel(c.bufferStatus)}
                      tone={bufferTone(c.bufferStatus)}
                    />
                    {c.blocking.state !== 'none' ? (
                      <SignalPill
                        label={`${blockingLabel(c.blocking.state)} ${c.blockingDisplayDays}d`}
                        tone={c.blocking.state === 'escalated' ? 'danger' : 'warning'}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {cm ? (
                    <>
                      <AdminAvatar name={cm.name} avatarUrl={cm.avatar_url} size="sm" />
                      <span className="text-sm text-foreground">
                        {cm.name.split(' ')[0]}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {c.pricing_status === 'unknown'
                    ? 'Ej satt'
                    : (c.monthly_price ?? 0) > 0
                      ? `${(c.monthly_price ?? 0).toLocaleString('sv-SE')} kr`
                      : '—'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {shortDateSv(c.created_at)}
                </div>
                <div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${sc.className}`}
                  >
                    {sc.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-muted-foreground">
            Visar {pageStart}-{pageEnd} av {filtered.length}
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updatePage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="rounded-md border border-border bg-card px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Forra
              </button>
              <span className="text-muted-foreground">
                Sida {currentPage} av {totalPages}
              </span>
              <button
                type="button"
                onClick={() => updatePage(currentPage + 1)}
                disabled={currentPage >= totalPages}
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
          await refetch();
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

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function onboardingLabel(state: OnboardingState) {
  if (state === 'cm_ready') return 'CM-redo';
  if (state === 'live') return 'Live';
  if (state === 'settled') return 'Stabil';
  return 'Inviterad';
}

function onboardingTone(
  state: OnboardingState,
  needsAttention: boolean,
): 'info' | 'warning' | 'success' {
  if (state === 'live' || state === 'settled') return 'success';
  if (state === 'cm_ready' && needsAttention) return 'warning';
  return 'info';
}

function bufferLabel(status: CustomerBufferStatus) {
  if (status === 'ok') return 'Buffer ok';
  if (status === 'thin') return 'Tunn buffer';
  if (status === 'under') return 'Underfylld';
  if (status === 'blocked') return 'Buffrad men blockerad';
  return 'Pausad';
}

function bufferTone(
  status: CustomerBufferStatus,
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'ok') return 'success';
  if (status === 'thin') return 'warning';
  if (status === 'under') return 'danger';
  if (status === 'blocked') return 'warning';
  return 'neutral';
}

function blockingLabel(state: BlockingState) {
  return state === 'escalated' ? 'Eskalerad' : 'Blockerad';
}
