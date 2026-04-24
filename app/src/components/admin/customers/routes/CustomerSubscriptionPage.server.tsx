import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { getAdminActionSession } from '@/app/admin/_actions/shared';
import CustomerSubscriptionActionsPanel from '@/components/admin/customers/routes/CustomerSubscriptionActionsPanel';
import type { CustomerSubscription } from '@/lib/admin/dtos/billing';
import type { CustomerDetail } from '@/lib/admin/dtos/customer';
import { customerStatusLabel, subscriptionStatusLabel } from '@/lib/admin/labels';
import { formatPriceSEK } from '@/lib/admin/money';
import { qk } from '@/lib/admin/queryKeys';
import {
  fetchCustomerDetailServer,
  fetchCustomerSubscriptionServer,
} from '@/lib/admin/server/customer-subscription';
import { shortDateSv } from '@/lib/admin/time';

export default async function CustomerSubscriptionPageContent({
  customerId,
  customer: initialCustomer,
  subscription: initialSubscription,
}: {
  customerId: string;
  customer?: CustomerDetail;
  subscription?: CustomerSubscription | null;
}) {
  const [_, customer] = await Promise.all([
    getAdminActionSession('customers.read'),
    initialCustomer ? Promise.resolve(initialCustomer) : fetchCustomerDetailServer(customerId),
  ]);

  const queryClient = new QueryClient();
  const subscription =
    initialSubscription ??
    (await fetchCustomerSubscriptionServer(customerId, customer.stripe_subscription_id));

  queryClient.setQueryData(qk.customers.detail(customerId), customer);
  queryClient.setQueryData(qk.customers.subscription(customerId), subscription);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">Abonnemangsöversikt</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-secondary/40 p-4">
                <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Nuvarande pris
                </div>
                <div className="font-heading text-2xl font-bold text-foreground">
                  {formatPriceSEK(customer.monthly_price, { fallback: 'Ej satt' })}
                </div>
              </div>

              <div className="rounded-lg bg-secondary/40 p-4">
                <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Status
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {subscription
                    ? subscription.cancel_at_period_end
                      ? 'Avslutas vid periodslut'
                      : subscriptionStatusLabel(subscription.status)
                    : customerStatusLabel(customer.status)}
                </div>
                {subscription?.current_period_end ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Periodslut {shortDateSv(subscription.current_period_end)}
                  </div>
                ) : null}
              </div>

              {customer.upcoming_price_change ? (
                <div className="rounded-lg bg-secondary/40 p-4 sm:col-span-2">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    Schemalagd prisändring
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                    <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                      Idag
                    </div>
                    <div className="h-px bg-border" />
                    <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {shortDateSv(customer.upcoming_price_change.effective_date)}
                    </div>
                  </div>
                  <div className="mt-3 text-sm font-semibold text-foreground">
                    {formatPriceSEK(customer.upcoming_price_change.price_ore, {
                      unit: 'ore',
                    })}{' '}
                    från {shortDateSv(customer.upcoming_price_change.effective_date)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <CustomerSubscriptionActionsPanel customerId={customerId} customer={customer} />
      </div>
    </HydrationBoundary>
  );
}
