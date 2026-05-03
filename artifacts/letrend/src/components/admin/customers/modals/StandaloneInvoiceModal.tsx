// @ts-nocheck
'use client';

import { useMemo, useState } from 'react';
import { Info, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { AdminModalShell } from '@/components/admin/ui/AdminModalShell';
import {
  adminModalAlertStyle,
  adminModalInputStyle,
  adminModalLabelStyle,
  adminModalPrimaryButtonStyle,
  adminModalSecondaryButtonStyle,
  adminModalSectionStyle,
} from '@/components/admin/ui/adminModalTokens';
import { LeTrendColors } from '@/styles/letrend-design-system';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';

export interface StandaloneInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  onCreated?: (invoice: {
    stripe_invoice_id: string;
    number: string | null;
    status: string;
    amount_due: number;
    amount_paid: number;
    display_amount_ore: number;
    currency: string;
    created_at: string;
    hosted_invoice_url: string | null;
    has_incomplete_operation: boolean;
  }) => void;
}

type DraftInvoiceLine = {
  id: string;
  description: string;
  amountKr: string;
};

function createDraftLine(): DraftInvoiceLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    amountKr: '',
  };
}

function sumDraftLines(lines: DraftInvoiceLine[]) {
  return lines.reduce((total, line) => {
    const amount = Number(line.amountKr);
    return total + (Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0);
  }, 0);
}

export function StandaloneInvoiceModal({
  open,
  onOpenChange,
  customerId,
  customerName,
  onCreated,
}: StandaloneInvoiceModalProps) {
  const [lines, setLines] = useState<DraftInvoiceLine[]>([createDraftLine()]);
  const [daysUntilDue, setDaysUntilDue] = useState<string>('14');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useAdminRefresh();
  const totalKr = useMemo(() => sumDraftLines(lines), [lines]);

  function resetForm() {
    setLines([createDraftLine()]);
    setDaysUntilDue('14');
  }

  function updateLine(
    lineId: string,
    patch: Partial<Pick<DraftInvoiceLine, 'description' | 'amountKr'>>,
  ) {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((current) => [...current, createDraftLine()]);
  }

  function removeLine(lineId: string) {
    setLines((current) => {
      if (current.length === 1) return [createDraftLine()];
      return current.filter((line) => line.id !== lineId);
    });
  }

  async function handleSubmit() {
    const parsedDays = Number(daysUntilDue);
    const normalizedLines = lines
      .map((line) => ({
        description: line.description.trim(),
        amount: Math.round(Number(line.amountKr)),
      }))
      .filter((line) => line.description.length > 0 || line.amount > 0);

    if (normalizedLines.length === 0) {
      toast.error('Lägg till minst en fakturarad.');
      return;
    }

    if (
      normalizedLines.some(
        (line) => !line.description || !Number.isFinite(line.amount) || line.amount <= 0,
      )
    ) {
      toast.error('Varje rad måste ha beskrivning och belopp över 0.');
      return;
    }

    if (!Number.isFinite(parsedDays) || parsedDays < 1 || parsedDays > 90) {
      toast.error('Ange förfallodagar mellan 1 och 90.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/invoices/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_profile_id: customerId,
          items: normalizedLines,
          days_until_due: Math.round(parsedDays),
          auto_finalize: true,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(body.error ?? `Kunde inte skapa faktura (${res.status})`);
        return;
      }

      const createdInvoice = body.invoice;

      if (createdInvoice?.id && onCreated) {
        onCreated({
          stripe_invoice_id: createdInvoice.id,
          number: createdInvoice.number ?? null,
          status: createdInvoice.status ?? 'open',
          amount_due: createdInvoice.amount_due ?? 0,
          amount_paid: createdInvoice.amount_paid ?? 0,
          display_amount_ore: Math.max(
            createdInvoice.amount_due ?? 0,
            createdInvoice.amount_paid ?? 0,
          ),
          currency: createdInvoice.currency ?? 'sek',
          created_at: createdInvoice.created
            ? new Date(createdInvoice.created * 1000).toISOString()
            : new Date().toISOString(),
          hosted_invoice_url: createdInvoice.hosted_invoice_url ?? null,
          has_incomplete_operation: false,
        });
      }

      toast.success(`Engångsfaktura skapad för ${customerName}.`);
      resetForm();
      await refresh([{ type: 'customer-billing', customerId }, 'billing']);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nätverksfel');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminModalShell
      open={open}
      onClose={() => onOpenChange(false)}
      title="Skapa engångsfaktura"
      description="Faktureras separat och skickas direkt via Stripe. Pending invoice items dras inte in i detta flöde."
      size="lg"
      disableClose={submitting}
      footer={
        <>
          <button
            type="button"
            style={{ ...adminModalSecondaryButtonStyle, opacity: submitting ? 0.5 : 1 }}
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Avbryt
          </button>
          <button
            type="button"
            style={adminModalPrimaryButtonStyle(!submitting)}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Skapar…' : 'Skapa och skicka'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={adminModalAlertStyle('info')}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            För tillägg till nästa abonnemangsfaktura, använd <strong>Lägg till rad</strong> i väntande poster i stället.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lines.map((line, index) => (
            <div key={line.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ ...adminModalSectionStyle, flex: 1 }}>
                {index === 0 ? <div style={adminModalLabelStyle}>Beskrivning</div> : null}
                <input
                  value={line.description}
                  onChange={(event) =>
                    updateLine(line.id, { description: event.currentTarget.value })
                  }
                  maxLength={200}
                  placeholder="Installationsavgift"
                  style={adminModalInputStyle}
                />
              </div>
              <div style={{ ...adminModalSectionStyle, width: 130 }}>
                {index === 0 ? <div style={adminModalLabelStyle}>Belopp (kr)</div> : null}
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={line.amountKr}
                  onChange={(event) => updateLine(line.id, { amountKr: event.currentTarget.value })}
                  style={adminModalInputStyle}
                />
              </div>
              <button
                type="button"
                onClick={() => removeLine(line.id)}
                aria-label={`Ta bort rad ${index + 1}`}
                disabled={submitting}
                style={{
                  ...adminModalSecondaryButtonStyle,
                  padding: '8px 10px',
                  minHeight: 34,
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            onClick={addLine}
            disabled={submitting}
            style={{ ...adminModalSecondaryButtonStyle }}
          >
            <Plus size={14} />
            Lägg till rad
          </button>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: LeTrendColors.brownDark }}>
            Total: {totalKr.toLocaleString('sv-SE')} kr
          </div>
        </div>

        <div style={adminModalSectionStyle}>
          <div style={adminModalLabelStyle}>Förfaller om (dagar)</div>
          <input
            type="number"
            min={1}
            max={90}
            step={1}
            value={daysUntilDue}
            onChange={(event) => setDaysUntilDue(event.currentTarget.value)}
            style={adminModalInputStyle}
          />
        </div>
      </div>
    </AdminModalShell>
  );
}
