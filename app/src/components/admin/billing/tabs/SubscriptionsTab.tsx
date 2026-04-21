'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import SubscriptionPriceChangeModal from '@/components/admin/billing/SubscriptionPriceChangeModal';
import type { EnvFilter } from '@/components/admin/billing/BillingHub';
import { intervalLabel, subscriptionStatusConfig } from '@/lib/admin/labels';
import { formatSek } from '@/lib/admin/money';
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
};

export default function SubscriptionsTab({ env }: { env: EnvFilter }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedSubscription, setSelectedSubscription] = useState<SubscriptionRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'billing', 'subscriptions', env],
    queryFn: async () => {
      const url = `/api/admin/subscriptions?limit=200&page=1${
        env !== 'all' ? `&environment=${env}` : ''
      }`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Kunde inte ladda abonnemang');
      return (await response.json()) as SubscriptionResponse;
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/studio/stripe/sync-subscriptions', {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) throw new Error(payload.error || 'Sync misslyckades');
      return payload;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'billing', 'subscriptions'],
      });
    },
  });

  const subscriptions = data?.subscriptions ?? [];
  const active = subscriptions.filter(
    (subscription) =>
      subscription.status === 'active' && !subscription.cancel_at_period_end,
  );
  const expiring = subscriptions.filter(
    (subscription) => subscription.cancel_at_period_end,
  );
  const monthlyRecurringOre = active.reduce((sum, subscription) => {
    if (subscription.interval === 'year') return sum + Math.round(subscription.amount / 12);
    if (subscription.interval_count === 3) return sum + Math.round(subscription.amount / 3);
    return sum + subscription.amount;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <SummaryCard label="Aktiva" value={String(active.length)} />
        <SummaryCard label="MRR" value={formatSek(monthlyRecurringOre)} className="text-success" />
        <SummaryCard label="Avslutas" value={String(expiring.length)} className="text-warning" />
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50 lg:ml-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} />
          {sync.isPending ? 'Synkar...' : 'Synka fran Stripe'}
        </button>
      </div>

      {sync.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {sync.error instanceof Error ? sync.error.message : 'Sync misslyckades. Forsok igen om en stund.'}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_120px_120px] gap-4 border-b border-border bg-secondary/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Kund</div>
          <div>Pris</div>
          <div>Nasta period</div>
          <div>Intervall</div>
          <div>Status</div>
          <div />
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Laddar...</div>
        ) : (
          subscriptions.map((subscription, index) => {
            const status = subscription.cancel_at_period_end
              ? { label: 'Avslutas', className: 'bg-warning/10 text-warning' }
              : subscriptionStatusConfig(subscription.status);

            return (
              <div
                key={subscription.id}
                onClick={() =>
                  subscription.customer_profile_id &&
                  router.push(`/admin/customers/${subscription.customer_profile_id}`)
                }
                className={`grid grid-cols-[2fr_1fr_1fr_1fr_120px_120px] gap-4 px-5 py-3.5 ${
                  subscription.customer_profile_id ? 'cursor-pointer hover:bg-accent/30' : ''
                } ${index < subscriptions.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="text-sm font-medium text-foreground">{subscription.customer_name}</div>
                <div className="text-sm font-semibold text-foreground">{formatSek(subscription.amount)}</div>
                <div className="text-xs text-muted-foreground">{shortDateSv(subscription.current_period_end)}</div>
                <div className="text-xs text-muted-foreground">
                  {subscription.interval_count === 3 ? '/kvartal' : intervalLabel(subscription.interval ?? 'month')}
                </div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <div className="flex justify-end">
                  {subscription.customer_profile_id ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedSubscription(subscription);
                      }}
                      className="rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
                    >
                      Andra pris
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      <SubscriptionPriceChangeModal
        open={Boolean(selectedSubscription)}
        customerId={selectedSubscription?.customer_profile_id ?? ''}
        customerName={selectedSubscription?.customer_name ?? ''}
        currentPriceSek={
          selectedSubscription
            ? selectedSubscription.interval === 'year'
              ? selectedSubscription.amount / 1200
              : selectedSubscription.interval_count === 3
                ? selectedSubscription.amount / 300
                : selectedSubscription.amount / 100
            : null
        }
        onClose={() => setSelectedSubscription(null)}
        onChanged={async () => {
          setSelectedSubscription(null);
          await queryClient.invalidateQueries({ queryKey: ['admin', 'billing', 'subscriptions'] });
          await queryClient.invalidateQueries({ queryKey: ['admin', 'billing', 'invoices'] });
        }}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex-1 rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold text-foreground ${className}`}>{value}</div>
    </div>
  );
}
