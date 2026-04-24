'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AdminTable, { type AdminTableColumn } from '@/components/admin/_shared/AdminTable';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import SubscriptionPriceChangeModal from '@/components/admin/billing/SubscriptionPriceChangeModal';
import { useBillingSubscriptionsRefresh } from '@/hooks/admin/useAdminRefresh';
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
import { subscriptionStatusRich } from '@/lib/admin/labels';
import { formatSek } from '@/lib/admin/money';
import { qk } from '@/lib/admin/queryKeys';
import { EnvTag } from '../shared/EnvTag';
import { AdminActionMenu } from '@/components/admin/ui/AdminActionMenu';
import { toast } from 'sonner';
import { Settings2, User, ExternalLink } from 'lucide-react';

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
  const refreshSubscriptions = useBillingSubscriptionsRefresh();
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
    queryKey: qk.billing.subscriptionList(env, status, page, PAGE_SIZE),
    queryFn: async ({ signal }) => {
      const payload = await apiClient.get<BillingSubscriptionsResponse>('/api/admin/subscriptions', {
        signal,
        query: {
          limit: PAGE_SIZE,
          page,
          environment: env === 'all' ? undefined : env,
          status: status === 'all' ? undefined : status,
        },
      });
      return parseDto(billingSubscriptionsResponseSchema, payload, {
        name: 'billingSubscriptionsResponse',
        path: '/api/admin/subscriptions',
      });
    },
  });

  const subscriptions = data?.subscriptions ?? [];
  const pagination = data?.pagination;

  const columns: Array<AdminTableColumn<BillingSubscriptionsResponse['subscriptions'][number]>> = [
    {
      key: 'customer',
      header: 'Kund',
      width: '2fr',
      render: (sub) => (
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{sub.customer_name}</span>
          <EnvTag env={sub.environment} />
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Belopp',
      width: '1fr',
      align: 'right',
      render: (sub) => (
        <div className="text-sm font-semibold text-foreground">{formatSek(sub.amount)}</div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '1.5fr',
      render: (sub) => (
        <div className="text-xs text-muted-foreground">
          {subscriptionStatusRich({
            status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end,
            current_period_end: sub.current_period_end,
            created: sub.created
          })}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '40px',
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
        columns={columns}
        rows={subscriptions}
        getRowKey={(sub) => sub.id}
        rowHrefBuilder={(sub) => sub.customer_profile_id ? `/admin/customers/${sub.customer_profile_id}` : null}
        loadingRows={isLoading ? 6 : 0}
        emptyLabel="Inga abonnemang hittades."
        gridTemplateColumns="2fr 1fr 1.5fr 40px"
        density="comfortable"
      />

      {pagination && pagination.pageCount > 1 && (
        <div className="flex items-center justify-center gap-4 text-xs font-medium text-muted-foreground pt-2">
          <button disabled={!pagination.hasPreviousPage} className="hover:text-foreground disabled:opacity-30">Föregående</button>
          <span>{pagination.page} / {pagination.pageCount}</span>
          <button disabled={!pagination.hasNextPage} className="hover:text-foreground disabled:opacity-30">Nästa</button>
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
