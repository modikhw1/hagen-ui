// @ts-nocheck
'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { apiClient, ApiError } from '@/lib/admin/api-client';

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

const MAX_AMOUNT_KR_PER_LINE = 500_000;
const INTEGER_RX = /^\d+$/;

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function createDraftLine(): DraftInvoiceLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    amountKr: '',
  };
}

function parseStrictAmountKr(raw: string): number | null {
  const trimmed = raw.trim();
  if (!INTEGER_RX.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT_KR_PER_LINE) {
    return null;
  }
  return value;
}

function sumDraftLines(lines: DraftInvoiceLine[]) {
  return lines.reduce((total, line) => {
    const amount = parseStrictAmountKr(line.amountKr);
    return total + (amount ?? 0);
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
  // Idempotency-key per modal-instans, regen vid line- eller dueDays-byte.
  // Se AVTAL_AUDIT.md (#A3-D2).
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateUuid());

  const refresh = useAdminRefresh();
  const totalKr = useMemo(() => sumDraftLines(lines), [lines]);

  useEffect(() => {
    if (open) {
      setIdempotencyKey(generateUuid());
    }
  }, [open]);

  // Bara mutationen av lines/daysUntilDue ska rotera nyckeln (inte enbart
  // antalet rader — det hade triggat på varje keystroke i description).
  useEffect(() => {
    setIdempotencyKey(generateUuid());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length, daysUntilDue]);

  function resetForm() {
    setLines([createDraftLine()]);
    setDaysUntilDue('14');
    setIdempotencyKey(generateUuid());
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
    if (!customerId) {
      toast.error('Kund saknas — ladda om sidan och försök igen.');
      return;
    }

    const parsedDays = Number(daysUntilDue);
    if (!Number.isFinite(parsedDays) || parsedDays < 1 || parsedDays > 90) {
      toast.error('Ange förfallodagar mellan 1 och 90.');
      return;
    }

    // Strikt validering: varje rad måste ha både beskrivning OCH belopp.
    // Inga "tomma" rader tystas bort. Se AVTAL_AUDIT.md (#A3-D4, D5).
    const invalidIndex = lines.findIndex((line, index) => {
      const description = line.description.trim();
      const amount = parseStrictAmountKr(line.amountKr);
      const isEmpty = description.length === 0 && line.amountKr.trim().length === 0;
      // Tillåt sista raden att vara helt tom (UX: klick på "Lägg till rad")
      if (isEmpty && index === lines.length - 1 && lines.length > 1) return false;
      return description.length === 0 || amount === null;
    });

    if (invalidIndex !== -1) {
      toast.error(
        `Rad ${invalidIndex + 1}: beskrivning + heltal i kronor (1–${MAX_AMOUNT_KR_PER_LINE.toLocaleString('sv-SE')}).`,
      );
      return;
    }

    const normalizedItems = lines
      .map((line) => {
        const amount = parseStrictAmountKr(line.amountKr);
        return amount === null
          ? null
          : {
              description: line.description.trim(),
              amount_ore: amount * 100,
            };
      })
      .filter((item): item is { description: string; amount_ore: number } => item !== null);

    if (normalizedItems.length === 0) {
      toast.error('Lägg till minst en fakturarad.');
      return;
    }

    setSubmitting(true);
    try {
      // Använd apiClient (skickar Authorization-header). Se AVTAL_AUDIT.md (#A3-D3).
      const body = await apiClient.post<{ invoice?: Record<string, unknown>; error?: string }>(
        '/api/admin/invoices/create',
        {
          customer_profile_id: customerId,
          items: normalizedItems,
          days_until_due: Math.round(parsedDays),
          auto_finalize: true,
          idempotency_key: idempotencyKey,
        },
      );

      const createdInvoice = body?.invoice as Record<string, unknown> | undefined;
      const stripeStatus = String(createdInvoice?.status ?? 'open');

      if (createdInvoice?.id && onCreated) {
        const amountDue = Number(createdInvoice.amount_due ?? 0);
        const amountPaid = Number(createdInvoice.amount_paid ?? 0);
        const fallbackTotal = normalizedItems.reduce((sum, item) => sum + item.amount_ore, 0);
        onCreated({
          stripe_invoice_id: String(createdInvoice.id),
          number: (createdInvoice.number as string | null) ?? null,
          status: stripeStatus,
          amount_due: amountDue,
          amount_paid: amountPaid,
          // Fallback till summerat belopp om Stripe inte hunnit räkna ut det.
          // Se AVTAL_AUDIT.md (#A3-D6).
          display_amount_ore: Math.max(amountDue, amountPaid, fallbackTotal),
          currency: (createdInvoice.currency as string | undefined) ?? 'sek',
          created_at: createdInvoice.created
            ? new Date(Number(createdInvoice.created) * 1000).toISOString()
            : new Date().toISOString(),
          hosted_invoice_url: (createdInvoice.hosted_invoice_url as string | null) ?? null,
          has_incomplete_operation: stripeStatus === 'draft',
        });
      }

      // Differentiera mellan riktigt skickad och utkast (D9).
      if (stripeStatus === 'draft') {
        toast.warning(
          `Fakturan skapades som utkast för ${customerName}. Granska i Stripe innan den skickas.`,
        );
      } else {
        toast.success(`Engångsfaktura skapad för ${customerName}.`);
      }

      resetForm();
      await refresh([{ type: 'customer-billing', customerId }, 'billing']);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message || `Kunde inte skapa faktura (${err.status})`);
      } else {
        toast.error(err instanceof Error ? err.message : 'Nätverksfel');
      }
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
                  max={MAX_AMOUNT_KR_PER_LINE}
                  step={1}
                  value={line.amountKr}
                  onChange={(event) => {
                    // Avvisa decimaler, vetenskaplig notation, mellanslag.
                    const v = event.currentTarget.value;
                    if (v === '' || INTEGER_RX.test(v)) {
                      updateLine(line.id, { amountKr: v });
                    }
                  }}
                  onWheel={(event) => event.currentTarget.blur()}
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
            disabled={submitting || lines.length >= 50}
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
