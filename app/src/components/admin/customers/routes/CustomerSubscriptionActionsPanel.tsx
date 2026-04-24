'use client';

import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { resendInvite } from '@/app/admin/_actions/billing';
import SubscriptionActions from '@/components/admin/customers/SubscriptionActions';
import { useCustomerBillingRefresh } from '@/hooks/admin/useAdminRefresh';
import type { CustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { relativeSv } from '@/lib/admin/time';
import { CustomerSection } from './shared';

export default function CustomerSubscriptionActionsPanel({
  customerId,
  customer,
}: {
  customerId: string;
  customer: CustomerDetail;
}) {
  const refresh = useCustomerBillingRefresh(customerId);
  const canRecoverInvite = ['invited', 'pending', 'pending_payment', 'pending_invoice'].includes(
    customer.status,
  );

  const resendInviteMutation = useMutation({
    mutationKey: ['admin', 'customer-resend-invite', customerId],
    mutationFn: async () => {
      const result = await resendInvite({ customerId });
      if ('error' in result) {
        throw new Error(result.error.message);
      }

      return result.data;
    },
    onSuccess: async (result) => {
      toast.success(
        typeof (result as { message?: string }).message === 'string'
          ? (result as { message?: string }).message!
          : 'Åtgärden genomfördes.',
      );
      await refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte skicka ny länk.');
    },
  });

  const handleResendInvite = async () => {
    if (customer.invited_at) {
      const invitedAt = new Date(customer.invited_at).getTime();
      if (Number.isFinite(invitedAt) && Date.now() - invitedAt < 5 * 60 * 1000) {
        const confirmed = window.confirm(
          'Inbjudan skickades nyss. Vill du verkligen skicka en ny länk redan nu?',
        );
        if (!confirmed) {
          return;
        }
      }
    }

    await resendInviteMutation.mutateAsync();
  };

  return (
    <div className="space-y-6">
      <CustomerSection title="Snabbåtgärder">
        <div className="space-y-4">
          {customer.stripe_subscription_id ? (
            <Link
              href={`/admin/customers/${customerId}/subscription/price`}
              scroll={false}
              className="block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Ändra abonnemangspris
            </Link>
          ) : null}

          {canRecoverInvite ? (
            <div className="rounded-md border border-border bg-secondary/20 p-3">
              <div className="text-xs text-muted-foreground">
                Ny länk skickas till {customer.contact_email}
                {customer.invited_at ? ` · senast skickad ${relativeSv(customer.invited_at)}` : ''}
              </div>
              <button
                type="button"
                onClick={() => void handleResendInvite()}
                disabled={resendInviteMutation.isPending}
                className="mt-3 w-full rounded-md border border-border px-4 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                {resendInviteMutation.isPending
                  ? 'Skickar ny invite...'
                  : 'Skicka ny invite / recovery-länk'}
              </button>
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

      <CustomerSection title="Riskområde">
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
  );
}
