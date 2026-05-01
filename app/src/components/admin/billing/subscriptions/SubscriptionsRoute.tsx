'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import AdminTable, { type AdminTableColumn } from '@/components/admin/_shared/AdminTable';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import SubscriptionPriceChangeModal from '@/components/admin/billing/SubscriptionPriceChangeModal';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { apiClient } from '@/lib/admin/api-client';
import {
  subscriptionMonthlyPriceSek,
  type BillingSubscriptionStatusFilter,
  type EnvFilter,
} from '@/lib/admin/billing';
import { useStripeSyncSubscriptions } from '@/lib/admin/billing-ops';
import {
  billingSubscriptionsResponseSchema,
  type BillingSubscriptionsResponse,
} from '@/lib/admin/dtos/billing';
import { parseDto } from '@/lib/admin/dtos/parse';
import { formatSek } from '@/lib/admin/money';
import { qk } from '@/lib/admin/queryKeys';
import { shortDateSv } from '@/lib/admin/time';
import { EnvTag } from '../shared/EnvTag';
import { AdminActionMenu } from '@/components/admin/ui/AdminActionMenu';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { subscriptionStatusConfig } from '@/lib/admin/labels';
import { Settings2, User, ExternalLink, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';

const PAGE_SIZE = 50;

export default function SubscriptionsRoute({
  env,
  status,
  page,
}: {
  env: EnvFilter;
  status: BillingSubscriptionStatusFilter;
  page: number;
}) {
  const refresh = useAdminRefresh();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const currentSort = searchParams?.get('sort') || '';
  
  const refreshSubscriptions = () => refresh(['billing']);
  const [selectedSubscription, setSelectedSubscription] = useState<
    BillingSubscriptionsResponse['subscriptions'][number] | null
  >(null);
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false);
  
  const {
    run: syncSubscriptions,
    isPending,
    rateLimitRemainingSeconds,
  } = useStripeSyncSubscriptions(env);

  const { data, isLoading } = useQuery({
    queryKey: qk.billing.subscriptions(env, { status, page, limit: PAGE_SIZE, q: searchParams?.get('q') || undefined, sort: currentSort || undefined }),
    queryFn: async ({ signal }) => {
      const payload = await apiClient.get<BillingSubscriptionsResponse>('/api/admin/subscriptions', {
        signal,
        query: {
          limit: PAGE_SIZE,
          page,
          environment: env === 'all' ? undefined : env,
          status: status === 'all' ? undefined : status,
          sort: currentSort || undefined,
          q: searchParams?.get('q') || undefined,
        },
      });
      return parseDto(billingSubscriptionsResponseSchema, payload, {
        name: 'billingSubscriptionsResponse',
        path: '/api/admin/subscriptions',
      });
    },
    placeholderData: keepPreviousData,
  });

  const subscriptions = data?.subscriptions ?? [];
  const pagination = data?.pagination;

  const handleSort = (field: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    const asc = `${field}_asc`;
    const desc = `${field}_desc`;
    const rawSort = searchParams?.get('sort');
    
    if (rawSort === asc) {
      params.set('sort', desc);
    } else if (rawSort === desc) {
      params.delete('sort');
    } else {
      params.set('sort', asc);
    }
    
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const SortHeader = ({ label, field }: { label: string; field: string }) => {
    const isActive = currentSort.startsWith(field);
    const isAsc = currentSort.endsWith('asc');
    
    return (
      <button 
        onClick={() => handleSort(field)}
        className="group flex items-center gap-1 hover:text-foreground transition-colors"
        style={{ all: 'unset', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        {isActive ? (
          isAsc ? <ChevronUp size={12} className="text-primary ml-1" /> : <ChevronDown size={12} className="text-primary ml-1" />
        ) : (
          <ArrowUpDown size={12} className="ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </button>
    );
  };

  const columns: Array<AdminTableColumn<BillingSubscriptionsResponse['subscriptions'][number]>> = [
    {
      key: 'customer',
      header: 'KUND',
      width: '2.5fr',
      render: (sub) => (
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{sub.customer_name}</span>
            <EnvTag env={sub.environment} />
          </div>
          <span className="text-[10px] text-muted-foreground truncate font-mono uppercase tracking-tight">
            {sub.stripe_subscription_id}
          </span>
        </div>
      ),
    },
    {
      key: 'next_payment',
      header: 'NÄSTA BETALNING',
      width: '1.2fr',
      render: (sub) => (
        <div className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          {sub.current_period_end ? shortDateSv(sub.current_period_end) : '—'}
        </div>
      ),
    },
    {
      key: 'spacer',
      header: '',
      width: '48px',
      render: () => <div />,
    },
    {
      key: 'price',
      header: 'BELOPP',
      width: '1fr',
      render: (sub) => (
        <div className="flex flex-col">
          <div className="text-sm font-bold text-foreground">{formatSek(sub.amount)}</div>
          <div className="text-[10px] text-muted-foreground font-medium">{sub.interval_label}</div>
        </div>
      ),
    },
    {
      key: 'since',
      header: 'KUND SEDAN',
      width: '1fr',
      render: (sub) => (
        <div className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          {shortDateSv(sub.created)}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'STATUS',
      width: '1fr',
      render: (sub) => {
        const config = subscriptionStatusConfig({
          status: sub.status,
          cancel_at_period_end: sub.cancel_at_period_end,
        });
        return (
          <StatusPill
            label={config.label}
            tone={config.tone}
            size="xs"
          />
        );
      },
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      align: 'right',
      render: (sub) => (
        <AdminActionMenu
          items={[
            {
              label: 'Hantera abonnemang',
              icon: <Settings2 className="h-3.5 w-3.5" />,
              onClick: () => setSelectedSubscription(sub),
            },
            {
              label: 'Visa kund',
              icon: <User className="h-3.5 w-3.5" />,
              onClick: () => {
                if (sub.customer_profile_id) {
                  window.location.href = `/admin/customers/${sub.customer_profile_id}`;
                }
              },
            },
            {
              label: 'Öppna i Stripe',
              icon: <ExternalLink className="h-3.5 w-3.5" />,
              onClick: () => {
                const url = `https://dashboard.stripe.com/${sub.environment === 'test' ? 'test/' : ''}subscriptions/${sub.stripe_subscription_id}`;
                window.open(url, '_blank');
              },
            },
          ]}
        />
      ),
    },
  ];

  const tableColumns = columns.map(col => {
    if (col.key === 'customer') return { ...col, header: <SortHeader label="KUND" field="customer" /> };
    if (col.key === 'price') return { ...col, header: <SortHeader label="BELOPP" field="price" /> };
    if (col.key === 'status') return { ...col, header: <SortHeader label="STATUS" field="status" /> };
    if (col.key === 'next_payment') return { ...col, header: <SortHeader label="NÄSTA BETALNING" field="next_payment" /> };
    if (col.key === 'since') return { ...col, header: <SortHeader label="KUND SEDAN" field="since" /> };
    return col;
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
          {data?.summary?.activeCount ?? 0} Aktiva abonnemang
        </div>
        <button
          onClick={() => setConfirmSyncOpen(true)}
          disabled={isPending || rateLimitRemainingSeconds > 0}
          className="text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {isPending ? 'Synkar...' : 'Kör Stripe-synk'}
        </button>
      </div>

      <AdminTable
        columns={tableColumns as any}
        rows={subscriptions}
        getRowKey={(sub) => sub.id}
        rowHrefBuilder={(sub) => sub.customer_profile_id ? `/admin/customers/${sub.customer_profile_id}` : null}
        loadingRows={isLoading && !data ? 6 : 0}
        emptyLabel="Inga abonnemang hittades."
        gridTemplateColumns="minmax(200px, 2.5fr) minmax(120px, 1.2fr) 48px 1fr 1fr 1fr 48px"
        density="comfortable"
      />

      {pagination && pagination.pageCount > 1 && (
        <div className="flex items-center justify-center gap-4 text-xs font-medium text-muted-foreground pt-2">
          <button 
            disabled={!pagination.hasPreviousPage} 
            onClick={() => {
              const params = new URLSearchParams(searchParams?.toString() ?? '');
              params.set('page', String(pagination.page - 1));
              router.push(`${pathname}?${params.toString()}`, { scroll: false });
            }}
            className="hover:text-foreground disabled:opacity-30"
          >
            Föregående
          </button>
          <span>{pagination.page} / {pagination.pageCount}</span>
          <button 
            disabled={!pagination.hasNextPage} 
            onClick={() => {
              const params = new URLSearchParams(searchParams?.toString() ?? '');
              params.set('page', String(pagination.page + 1));
              router.push(`${pathname}?${params.toString()}`, { scroll: false });
            }}
            className="hover:text-foreground disabled:opacity-30"
          >
            Nästa
          </button>
        </div>
      )}

      <SubscriptionPriceChangeModal
        open={Boolean(selectedSubscription)}
        customerId={selectedSubscription?.customer_profile_id ?? ''}
        customerName={selectedSubscription?.customer_name ?? ''}
        currentPriceSek={selectedSubscription ? subscriptionMonthlyPriceSek(selectedSubscription) : null}
        onClose={() => setSelectedSubscription(null)}
        onChanged={async () => {
          setSelectedSubscription(null);
          await refreshSubscriptions();
        }}
      />

      <ConfirmActionDialog
        open={confirmSyncOpen}
        onOpenChange={setConfirmSyncOpen}
        title="Kör manuell synk?"
        description="Hämtar in abonnemangsdata från Stripe."
        confirmLabel="Kör synk"
        onConfirm={() => {
          setConfirmSyncOpen(false);
          void syncSubscriptions();
        }}
        pending={isPending}
      />
    </div>
  );
}