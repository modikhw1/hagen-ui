'use client';

import Link from 'next/link';
import { useState } from 'react';
import SubscriptionActions from '@/components/admin/customers/SubscriptionActions';
import { useCustomerRouteRefresh } from '@/hooks/admin/useAdminRefresh';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerSubscription } from '@/hooks/admin/useCustomerSubscription';
import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import { callCustomerAction } from '@/lib/admin/api-client';
import { CustomerRouteError, CustomerRouteLoading, CustomerSection } from './shared';

export default function CustomerSubscriptionRoute({
  customerId,
}: {
  customerId: string;
}) {
  const { data: customer, isLoading, error } = useCustomerDetail(customerId);
  const { data: subscription } = useCustomerSubscription(
    customerId,
    customer?.stripe_subscription_id ?? null,
  );
  const refresh = useCustomerRouteRefresh(customerId);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  if (isLoading) {
    return <CustomerRouteLoading label="Laddar abonnemang..." />;
  }

  if (error || !customer) {
    return <CustomerRouteError message={error?.message || 'Kunden hittades inte.'} />;
  }

  const canRecoverInvite = ['invited', 'pending', 'pending_payment', 'pending_invoice'].includes(
    customer.status,
  );

  const resendInvite = async () => {
    setActionPending('resend_invite');
    setActionError(null);
    setActionMessage(null);

    try {
      const result = await callCustomerAction(customer.id, { action: 'resend_invite' });
      if (!result.ok) {
        throw new Error(result.error || 'Kunde inte uppdatera kunden');
      }

      setActionMessage(result.message || 'Atgarden genomfordes.');
      await refresh();
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : 'Kunde inte uppdatera kunden');
    } finally {
      setActionPending(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-6">
        <CustomerSection title="Abonnemangsoversikt">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-secondary/40 p-4">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Nuvarande pris
              </div>
              <div className="font-heading text-2xl font-bold text-foreground">
                {(customer.monthly_price ?? 0) > 0
                  ? `${(customer.monthly_price ?? 0).toLocaleString('sv-SE')} kr`
                  : 'Ej satt'}
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
                    : subscription.status
                  : customer.status}
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
                  Schemalagd prisandring
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {formatSek(customer.upcoming_price_change.price * 100)} fran{' '}
                  {shortDateSv(customer.upcoming_price_change.effective_date)}
                </div>
              </div>
            ) : null}
          </div>
        </CustomerSection>
      </div>

      <div className="space-y-6">
        <CustomerSection title="Snabbatgarder">
          <div className="space-y-4">
            {customer.stripe_subscription_id ? (
              <Link
                href={`/admin/customers/${customerId}/subscription/price`}
                scroll={false}
                className="block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Andra abonnemangspris
              </Link>
            ) : null}

            {canRecoverInvite ? (
              <div className="rounded-md border border-border bg-secondary/20 p-3">
                <div className="text-xs text-muted-foreground">
                  Ny lank skickas till {customer.contact_email}
                  {customer.invited_at ? ` · senaste invite ${shortDateSv(customer.invited_at)}` : ''}
                </div>
                <button
                  type="button"
                  onClick={() => void resendInvite()}
                  disabled={actionPending === 'resend_invite'}
                  className="mt-3 w-full rounded-md border border-border px-4 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {actionPending === 'resend_invite'
                    ? 'Skickar ny invite...'
                    : 'Skicka ny invite / recovery-lank'}
                </button>
                {actionMessage ? (
                  <div className="mt-3 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
                    {actionMessage}
                  </div>
                ) : null}
                {actionError ? (
                  <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {actionError}
                  </div>
                ) : null}
              </div>
            ) : null}

            <SubscriptionActions
              customerId={customerId}
              customer={customer}
              variant="safe"
              onChanged={() => {
                void refresh();
              }}
            />
          </div>
        </CustomerSection>

        <CustomerSection title="Faroomrade">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <SubscriptionActions
              customerId={customerId}
              customer={customer}
              variant="danger"
              onChanged={() => {
                void refresh();
              }}
            />
          </div>
        </CustomerSection>
      </div>
    </div>
  );
}
