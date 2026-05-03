'use client';

import { useState } from 'react';
import { AdminField } from '@/components/admin/shared/AdminField';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { useConvertDemo } from '@/hooks/admin/useDemos';
import { demosCopy } from '@/lib/admin/copy/demos';
import { formatSek } from '@/lib/admin/money';
import { todayDateInput } from '@/lib/admin/time';

type DemoSummary = {
  id: string;
  company_name: string;
  contact_email: string | null;
  proposed_price_ore: number | null;
};

type ConvertResult = {
  invite_sent?: boolean;
  warning?: string | null;
};

type Props = {
  demo: DemoSummary | null;
  open: boolean;
  onClose: () => void;
  onSaved: (result: ConvertResult) => void | Promise<void>;
};

const todayYmd = () => todayDateInput();

export default function ConvertDemoDialog({ demo, open, onClose, onSaved }: Props) {
  if (!open || !demo) {
    return null;
  }

  return <ConvertDemoDialogSession key={demo.id} demo={demo} onClose={onClose} onSaved={onSaved} />;
}

function ConvertDemoDialogSession({
  demo,
  onClose,
  onSaved,
}: Omit<Props, 'open'> & { demo: DemoSummary }) {
  const [billingDay, setBillingDay] = useState('25');
  const [contractStartDate, setContractStartDate] = useState(todayYmd());
  const [sendInvite, setSendInvite] = useState(true);
  const convertDemo = useConvertDemo();

  const canSendInvite = Boolean(demo.contact_email);

  const handleSubmit = async () => {
    if (convertDemo.isPending) return;

    const result = await convertDemo.mutateAsync({
      id: demo.id,
      payload: {
        send_invite: canSendInvite ? sendInvite : false,
        billing_day_of_month: clampBillingDay(billingDay),
        contract_start_date: contractStartDate || todayYmd(),
      },
    });

    await onSaved({
      invite_sent: result.invite_sent,
      warning: result.warning ?? null,
    });
    onClose();
  };

  return (
    <AdminFormDialog
      open
      onClose={onClose}
      title={demosCopy.convertDialogTitle}
      description={demosCopy.convertDescription}
      error={convertDemo.error instanceof Error ? convertDemo.error.message : null}
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={convertDemo.isPending}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={convertDemo.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {convertDemo.isPending ? demosCopy.convertDialogSubmitting : demosCopy.convertDialogSubmit}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
          <div className="font-semibold text-foreground">{demo.company_name}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {demo.contact_email || demosCopy.convertNoContactEmail}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {demo.proposed_price_ore == null
              ? demosCopy.convertMissingPrice
              : demosCopy.convertPriceLabel(formatSek(demo.proposed_price_ore))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label={demosCopy.startDateLabel} htmlFor="contract_start_date">
            <input
              id="contract_start_date"
              value={contractStartDate}
              onChange={(event) => setContractStartDate(event.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              type="date"
            />
          </AdminField>
          <AdminField label={demosCopy.billingDayLabel} htmlFor="billing_day">
            <input
              id="billing_day"
              value={billingDay}
              onChange={(event) => setBillingDay(event.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              inputMode="numeric"
            />
          </AdminField>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-3 text-sm">
          <input
            checked={canSendInvite ? sendInvite : false}
            disabled={!canSendInvite}
            onChange={(event) => setSendInvite(event.target.checked)}
            type="checkbox"
          />
          <span className="space-y-1">
            <span className="block font-medium text-foreground">{demosCopy.inviteDirectLabel}</span>
            <span className="block text-xs text-muted-foreground">
              {canSendInvite
                ? demosCopy.convertInviteDescription
                : demosCopy.convertInviteMissingEmail}
            </span>
          </span>
        </label>
      </div>
    </AdminFormDialog>
  );
}

function clampBillingDay(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(28, parsed));
}
