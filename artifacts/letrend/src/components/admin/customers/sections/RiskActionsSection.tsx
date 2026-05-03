'use client';

import { useState } from 'react';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { CustomerSection, CustomerSectionSkeleton } from '@/components/admin/customers/routes/shared';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import { toast } from 'sonner';

export default function RiskActionsSection({ customerId }: { customerId: string }) {
  const { data: customer, isLoading } = useCustomerDetail(customerId);
  const [confirmAction, setConfirmAction] = useState<'archive' | 'cancel_immediate' | 'resend_invite' | 'reactivate' | null>(null);

  const archiveMutation = useCustomerMutation(customerId, 'archive_customer', {
    onSuccess: () => { 
      toast.success('Kunden har arkiverats');
      setConfirmAction(null);
    }
  });

  const cancelMutation = useCustomerMutation(customerId, 'cancel_subscription', {
    onSuccess: () => {
      toast.success('Abonnemanget har avslutats omedelbart');
      setConfirmAction(null);
    }
  });

  const resendInviteMutation = useCustomerMutation(customerId, 'resend_invite', {
    onSuccess: () => {
      toast.success('Inbjudan har skickats om');
      setConfirmAction(null);
    }
  });

  const reactivateMutation = useCustomerMutation(customerId, 'reactivate_archive', {
    onSuccess: () => {
      toast.success('Kunden har återaktiverats');
      setConfirmAction(null);
    }
  });

  if (isLoading) return <CustomerSectionSkeleton blocks={1} />;
  if (!customer) return null;

  const isPending = ['invited', 'pending', 'pending_invoice', 'pending_payment', 'past_due'].includes(customer.status);
  const isArchived = customer.status === 'archived';

  return (
    <CustomerSection title="Riskåtgärder">
      <div className="space-y-3">
        {isPending && (
          <button
            onClick={() => setConfirmAction('resend_invite')}
            className="w-full rounded-md border border-border bg-background px-4 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Skicka ny inbjudan
          </button>
        )}

        {isArchived ? (
          <button
            onClick={() => setConfirmAction('reactivate')}
            className="w-full rounded-md border border-primary/20 bg-primary/5 px-4 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Återaktivera kund från arkiv
          </button>
        ) : (
          <>
            <button
              onClick={() => setConfirmAction('cancel_immediate')}
              className="w-full rounded-md border border-status-danger-fg/20 bg-background px-4 py-2 text-left text-sm font-medium text-status-danger-fg transition-colors hover:bg-status-danger-bg"
            >
              Avsluta abonnemang omedelbart
            </button>

            <button
              onClick={() => setConfirmAction('archive')}
              className="w-full rounded-md border border-status-danger-fg/20 bg-background px-4 py-2 text-left text-sm font-medium text-status-danger-fg transition-colors hover:bg-status-danger-bg"
            >
              Arkivera kund
            </button>
          </>
        )}
      </div>

      <ConfirmActionDialog
        open={confirmAction === 'resend_invite'}
        onOpenChange={(v) => !v && setConfirmAction(null)}
        title="Skicka ny inbjudan?"
        description="Detta skickar ett nytt välkomstmejl till kunden med länken för att komma igång."
        confirmLabel="Skicka mejl"
        onConfirm={() => resendInviteMutation.mutateAsync({})}
        pending={resendInviteMutation.isPending}
      />

      <ConfirmActionDialog
        open={confirmAction === 'reactivate'}
        onOpenChange={(v) => !v && setConfirmAction(null)}
        title="Återaktivera kunden?"
        description="Kunden flyttas tillbaka från arkivet. Du behöver manuellt sätta upp ett nytt abonnemang om det gamla var avslutat."
        confirmLabel="Återaktivera"
        onConfirm={() => reactivateMutation.mutateAsync({})}
        pending={reactivateMutation.isPending}
      />
    </CustomerSection>
  );
}
