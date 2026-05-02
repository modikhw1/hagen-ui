'use client';

import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerSubscription } from '@/hooks/admin/useCustomerSubscription';
import { CustomerSection, CustomerSectionSkeleton } from '@/components/admin/customers/routes/shared';
import { shortDateSv } from '@/lib/admin/time';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import SubscriptionModal from '../modals/SubscriptionModal';

export default function SubscriptionSection({ customerId }: { customerId: string }) {
  const { data: customer, isLoading: customerLoading } = useCustomerDetail(customerId);
  const { data: subscription, isLoading: subLoading } = useCustomerSubscription(customerId);
  const [modalOpen, setModalOpen] = useState(false);

  if (customerLoading || subLoading) return <CustomerSectionSkeleton blocks={2} />;
  if (!customer) return null;

  return (
    <CustomerSection 
      title="Abonnemang" 
      action={
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Hantera abonnemang
        </button>
      }
    >
      <div className="space-y-4">
        {subscription ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Stripe-status</div>
              <div className="flex items-center gap-2">
                <StatusPill 
                  label={statusLabel(subscription.status, subscription.cancel_at_period_end)} 
                  tone={subscription.status === 'active' && !subscription.cancel_at_period_end ? 'success' : 'warning'}
                  size="xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Period</div>
              <div className="text-sm text-foreground">
                {subscription.current_period_end ? `Slutar ${shortDateSv(subscription.current_period_end)}` : '—'}
              </div>
            </div>
            {subscription.cancel_at_period_end && (
              <div className="col-span-2 rounded-md bg-status-warning-bg px-3 py-2 text-xs text-status-warning-fg">
                Abonnemanget avslutas vid periodens slut.
              </div>
            )}
            {customer.paused_until && (
              <div className="col-span-2 rounded-md bg-status-info-bg px-3 py-2 text-xs text-status-info-fg">
                Pausad till {shortDateSv(customer.paused_until)}.
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Inget aktivt Stripe-abonnemang hittades.</div>
        )}
      </div>

      <SubscriptionModal 
        open={modalOpen} 
        onClose={() => setModalOpen(false)} 
        customerId={customerId} 
        customer={customer}
        subscription={subscription ?? null}
      />
    </CustomerSection>
  );
}

function statusLabel(status: string, cancelAtPeriodEnd: boolean) {
  if (cancelAtPeriodEnd) return 'Avslutas';
  if (status === 'paused') return 'Pausad';
  if (status === 'active') return 'Aktiv';
  if (status === 'past_due') return 'Förfallen';
  if (status === 'trialing') return 'Trial';
  if (status === 'canceled' || status === 'cancelled') return 'Avslutad';
  return status || 'Okänd';
}
