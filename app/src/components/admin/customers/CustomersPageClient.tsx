'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownAZ, ArrowUpAZ, Search, Filter, Clock, PauseCircle } from 'lucide-react';
import EmptyValue from '@/components/admin/_shared/EmptyValue';
import AdminAvatar from '@/components/admin/AdminAvatar';
import InviteCustomerModal from '@/components/admin/customers/InviteCustomerModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomerListParamsState } from '@/hooks/admin/useCustomerListParamsState';
import { CUSTOMERS_PAGE_SIZE } from '@/lib/admin/customers/list.constants';
import EmptyState from '@/components/admin/ui/EmptyState';
import { Users } from 'lucide-react';
import {
  customerStatusConfig,
  onboardingLabel,
} from '@/lib/admin/labels';
import { cmColorVar } from '@/lib/admin/teamPalette';
import { formatPriceSEK } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import type {
  AdminCustomerListItem,
  AdminTeamOption,
  CustomerListFilter,
  CustomerListSort,
} from '@/lib/admin/customers/list.types';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import { CustomerPulsePill } from './CustomerPulsePill';
import { StatusPill } from '@/components/admin/ui/StatusPill';

function buildExportHref(params: {
  search: string;
  filter: CustomerListFilter;
  sort: CustomerListSort;
}) {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('q', params.search);
  if (params.filter !== 'all') searchParams.set('filter', params.filter);
  if (params.sort !== 'newest') searchParams.set('sort', params.sort);
  const query = searchParams.toString();
  return query ? `/api/admin/customers/export?${query}` : '/api/admin/customers/export';
}

type CustomersPageClientProps = {
  rows: AdminCustomerListItem[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  filter: CustomerListFilter;
  sort: CustomerListSort;
  team: AdminTeamOption[];
};

export default function CustomersPageClient(props: CustomersPageClientProps) {
  const { search, filter, sort, page } = props;
  const key = `${search}|${filter}|${sort}|${page}`;

  return <CustomersPageClientBody key={key} {...props} />;
}

function CustomersPageClientBody({
  rows,
  total,
  page,
  totalPages,
  search,
  filter,
  sort,
  team,
}: CustomersPageClientProps) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [showInvite, setShowInvite] = useState(false);
  const initialParams = useMemo(
    () => ({
      search,
      filter,
      sort,
      page,
    }),
    [filter, page, search, sort],
  );
  const { params, searchInput, setSearchInput, isPending, dispatch, submitSearch } =
    useCustomerListParamsState(initialParams);
  const pageStart = total === 0 ? 0 : (params.page - 1) * CUSTOMERS_PAGE_SIZE + 1;
  const pageEnd = Math.min(total, params.page * CUSTOMERS_PAGE_SIZE);
  
  const cmByName = useMemo(() => {
    const map = new Map<string, AdminTeamOption>();
    team.forEach((member) => {
      map.set(member.name.toLowerCase(), member);
      if (member.email) {
        map.set(member.email.toLowerCase(), member);
      }
    });
    return map;
  }, [team]);
  const exportHref = buildExportHref(params);

  return (
    <div>
      <PageHeader
        title="Kunder"
        subtitle={isPending || isRefreshing ? 'Uppdaterar...' : `${total} kund${total === 1 ? '' : 'er'}`}
        actions={
          <>
            <a
              href={exportHref}
              className="inline-flex h-10 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              Exportera CSV
            </a>
            <Button onClick={() => setShowInvite(true)}>+ Bjud in kund</Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
          className="relative max-w-xs flex-1"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            placeholder="Sök kund..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="bg-card pl-9"
          />
        </form>
        <div className="flex gap-0.5 rounded-md bg-secondary p-1">
          {(['all', 'active', 'pipeline', 'archived'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => dispatch({ type: 'filter', value: key })}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                params.filter === key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {key === 'all' ? 'Alla' : key === 'active' ? 'Aktiva' : key === 'pipeline' ? 'Pipeline' : 'Arkiverade'}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2 px-1 border-l border-border ml-1">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={params.sort}
            onChange={(e) => dispatch({ type: 'sort', value: e.target.value as any })}
            className="bg-transparent text-xs font-medium text-muted-foreground focus:outline-none hover:text-foreground cursor-pointer"
          >
            <option value="newest">Senast tillagd</option>
            <option value="oldest">Äldst först</option>
            <option value="needs_action">Behöver åtgärd först</option>
            <option value="alphabetical">Namn (A-Ö)</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[2.5fr_1fr_1fr_120px_120px] gap-4 border-b border-border bg-secondary/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Företag</div>
          <div>CM</div>
          <div>Pris</div>
          <div className="text-center">Operativ puls</div>
          <div>Status</div>
        </div>

        {rows.length === 0 ? (
          <div className="p-12">
            <EmptyState 
              icon={Users}
              title="Inga kunder hittades" 
              hint={params.search ? `Sökningen på "${params.search}" gav inga träffar.` : "Prova att ändra dina filter eller bjud in en ny kund."}
            />
          </div>
        ) : (
          rows.map((customer, index) => {
            const cm = customer.account_manager
              ? cmByName.get(customer.account_manager.toLowerCase())
              : undefined;
            const statusConfig = customerStatusConfig(customer.status);

            return (
              <Link
                key={customer.id}
                href={`/admin/customers/${customer.id}`}
                prefetch={false}
                scroll={false}
                className={`grid grid-cols-[2.5fr_1fr_1fr_120px_120px] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/30 ${
                  index < rows.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {customer.business_name}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{customer.contact_email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {cm ? (
                    <div className="flex items-center gap-1.5">
                      <AdminAvatar 
                        name={cm.name} 
                        avatarUrl={null} 
                        size="sm" 
                        fallbackColor={`hsl(var(--${cmColorVar(cm.id)}))`}
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-foreground">{cm.name.split(' ')[0]}</span>
                        {customer.scheduled_cm_change && (
                          <div className="flex items-center gap-0.5 text-[9px] font-semibold text-status-info-fg leading-none mt-0.5" title={`CM-byte till ${customer.scheduled_cm_change.next_cm_name} den ${shortDateSv(customer.scheduled_cm_change.effective_date)}`}>
                            <Clock className="h-2.5 w-2.5" />
                            {shortDateSv(customer.scheduled_cm_change.effective_date)}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                  {customer.paused_until && (
                    <div className="flex items-center gap-0.5 rounded-full bg-status-warning-bg px-1.5 py-0.5 text-[9px] font-bold text-status-warning-fg" title={`Pausad till ${shortDateSv(customer.paused_until)}`}>
                      <PauseCircle className="h-2.5 w-2.5" />
                      Paus
                    </div>
                  )}
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {customer.pricing_status === 'unknown' ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    formatPriceSEK(customer.monthly_price)
                  )}
                </div>
                <div className="flex justify-center">
                  <CustomerPulsePill 
                    status={(customer as any).cmPulseStatus || 'ok'} 
                    detail={{
                      lastPublishedAt: shortDateSv(customer.last_upload_at),
                      lastCmActionAt: null, // Vi behöver hämta detta
                      pendingConcepts: customer.concepts_per_week || 0
                    }} 
                  />
                </div>
                <div>
                  <StatusPill 
                    label={statusConfig.label} 
                    tone={statusConfig.className.includes('success') ? 'success' : statusConfig.className.includes('warning') ? 'warning' : statusConfig.className.includes('danger') ? 'danger' : statusConfig.className.includes('info') ? 'info' : 'neutral'} 
                    size="xs" 
                  />
                </div>
              </Link>
            );
          })
        )}
      </div>

      {total > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-muted-foreground text-xs">
            Visar {pageStart}-{pageEnd} av {total}
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dispatch({ type: 'page', value: Math.max(1, params.page - 1) })}
                disabled={params.page <= 1}
                className="bg-card h-8"
              >
                Förra
              </Button>
              <span className="text-xs text-muted-foreground">
                {params.page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  dispatch({ type: 'page', value: Math.min(totalPages, params.page + 1) })
                }
                disabled={params.page >= totalPages}
                className="bg-card h-8"
              >
                Nästa
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <InviteCustomerModal
        open={showInvite}
        team={team}
        onClose={() => setShowInvite(false)}
        onCreated={async (_customerId, meta) => {
          if (!meta?.profileUrl) {
            setShowInvite(false);
          }
          startRefresh(() => router.refresh());
        }}
      />
    </div>
  );
}
