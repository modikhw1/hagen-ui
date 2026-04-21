'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AdminTable, { type AdminTableColumn } from '@/components/admin/_shared/AdminTable';
import StatusPill from '@/components/admin/_shared/StatusPill';
import SummaryCard from '@/components/admin/_shared/SummaryCard';
import SubscriptionPriceChangeModal from '@/components/admin/billing/SubscriptionPriceChangeModal';
import { useBillingSubscriptionsRefresh } from '@/hooks/admin/useAdminRefresh';
import { type EnvFilter, subscriptionPricePerInterval } from '@/lib/admin/billing';
import { useStripeSyncSubscriptions } from '@/lib/admin/billing-ops';
import { intervalLabel, subscriptionStatusConfig } from '@/lib/admin/labels';
import { formatSek } from '@/lib/admin/money';
import { qk } from '@/lib/admin/queryKeys';
import { shortDateSv } from '@/lib/admin/time';

type SubscriptionRow = {
  id: string;
  customer_name: string;
  customer_profile_id: string | null;
  amount: number;
  status: string;
  interval: string | null;
  interval_count: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

type SubscriptionResponse = {
  subscriptions: SubscriptionRow[];
  summary?: {
    activeCount: number;
    expiringCount: number;
    mrrOre: number;
  };
};

const columns: Array<AdminTableColumn<SubscriptionRow>> = [
  {
    key: 'customer',
    header: 'Kund',
    width: '2fr',
    render: (subscription) => (
      <div className="truncate text-sm font-medium text-foreground">
        {subscription.customer_name}
      </div>
    ),
  },
  {
    key: 'price',
    header: 'Pris',
    width: '1fr',
    render: (subscription) => (
      <div className="text-sm font-semibold text-foreground">
        {formatSek(subscription.amount)}
      </div>
    ),
  },
  {
    key: 'period_end',
    header: 'Nästa period',
    width: '1fr',
    render: (subscription) => (
      <div className="text-xs text-muted-foreground">
        {shortDateSv(subscription.current_period_end)}
      </div>
    ),
  },
  {
    key: 'interval',
    header: 'Intervall',
    width: '1fr',
    render: (subscription) => (
      <div className="text-xs text-muted-foreground">
        {subscription.interval_count === 3
          ? '/kvartal'
          : intervalLabel(subscription.interval ?? 'month')}
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '120px',
    render: (subscription) => {
      const status = subscription.cancel_at_period_end
        ? { label: 'Avslutas', className: 'bg-warning/10 text-warning' }
        : subscriptionStatusConfig(subscription.status);

      return <StatusPill config={status} />;
    },
  },
  {
    key: 'actions',
    header: '',
    width: '120px',
    align: 'right',
    linkable: false,
    render: () => null,
  },
];

export default function SubscriptionsRoute({ env }: { env: EnvFilter }) {
  const refreshSubscriptions = useBillingSubscriptionsRefresh(env);
  const [selectedSubscription, setSelectedSubscription] = useState<SubscriptionRow | null>(null);
  const { run: syncSubscriptions, isPending, error } = useStripeSyncSubscriptions(env);

  const { data, isLoading } = useQuery({
    queryKey: qk.billing.subscriptions(env),
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '200',
        page: '1',
      });

      if (env !== 'all') {
        params.set('environment', env);
      }

      const response = await fetch(`/api/admin/subscriptions?${params.toString()}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Kunde inte ladda abonnemang');
      }

      return (await response.json()) as SubscriptionResponse;
    },
  });

  const subscriptions = data?.subscriptions ?? [];
  const summary = data?.summary ?? {
    activeCount: subscriptions.filter(
      (subscription) => subscription.status === 'active' && !subscription.cancel_at_period_end,
    ).length,
    expiringCount: subscriptions.filter((subscription) => subscription.cancel_at_period_end).length,
    mrrOre: subscriptions
      .filter((subscription) => subscription.status === 'active' && !subscription.cancel_at_period_end)
      .reduce((sum, subscription) => {
        if (subscription.interval === 'year') return sum + Math.round(subscription.amount / 12);
        if (subscription.interval_count === 3) return sum + Math.round(subscription.amount / 3);
        return sum + subscription.amount;
      }, 0),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <SummaryCard label="Aktiva" value={String(summary.activeCount)} />
        <SummaryCard label="MRR" value={formatSek(summary.mrrOre)} tone="success" />
        <SummaryCard label="Avslutas" value={String(summary.expiringCount)} tone="warning" />
        <button
          type="button"
          onClick={() => void syncSubscriptions()}
          disabled={isPending}
          className="self-start rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50 lg:ml-auto"
        >
          {isPending ? 'Synkar...' : 'Synka från Stripe'}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      <AdminTable
        columns={[
          ...columns.slice(0, 5),
          {
            ...columns[5],
            render: (subscription) => (
              <div className="flex justify-end">
                {subscription.customer_profile_id ? (
                  <button
                    type="button"
                    onClick={() => setSelectedSubscription(subscription)}
                    className="rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    Ändra pris
                  </button>
                ) : null}
              </div>
            ),
          },
        ]}
        rows={subscriptions}
        getRowKey={(subscription) => subscription.id}
        rowHrefBuilder={(subscription) =>
          subscription.customer_profile_id
            ? `/admin/customers/${subscription.customer_profile_id}`
            : null
        }
        loadingRows={isLoading ? 6 : 0}
        emptyLabel="Inga abonnemang hittades."
        gridTemplateColumns="2fr 1fr 1fr 1fr 120px 120px"
      />

      <SubscriptionPriceChangeModal
        open={Boolean(selectedSubscription)}
        customerId={selectedSubscription?.customer_profile_id ?? ''}
        customerName={selectedSubscription?.customer_name ?? ''}
        currentPriceSek={
          selectedSubscription ? subscriptionPricePerInterval(selectedSubscription).sek : null
        }
        onClose={() => setSelectedSubscription(null)}
        onChanged={async () => {
          setSelectedSubscription(null);
          await refreshSubscriptions();
        }}
      />
    </div>
  );
}
