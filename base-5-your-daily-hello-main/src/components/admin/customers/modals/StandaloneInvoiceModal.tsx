'use client';

import { useMemo, useState } from 'react';
import { Info, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';

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
  amountKr: string | number;
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
  const [daysUntilDue, setDaysUntilDue] = useState<string | number>(14);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useAdminRefresh();
  const totalKr = useMemo(() => sumDraftLines(lines), [lines]);

  function resetForm() {
    setLines([createDraftLine()]);
    setDaysUntilDue(14);
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
      if (current.length === 1) {
        return [createDraftLine()];
      }

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
      toast.error('Lagg till minst en fakturarad.');
      return;
    }

    if (
      normalizedLines.some(
        (line) => !line.description || !Number.isFinite(line.amount) || line.amount <= 0,
      )
    ) {
      toast.error('Varje rad maste ha beskrivning och belopp over 0.');
      return;
    }

    if (!Number.isFinite(parsedDays) || parsedDays < 1 || parsedDays > 90) {
      toast.error('Ange forfallodagar mellan 1 och 90.');
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

      const createdInvoice = body.invoice as
        | {
            id: string;
            number?: string | null;
            status?: string | null;
            amount_due?: number | null;
            amount_paid?: number | null;
            currency?: string | null;
            created?: number | null;
            hosted_invoice_url?: string | null;
          }
        | undefined;

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

      toast.success(`Engangsfaktura skapad for ${customerName}.`);
      resetForm();
      await refresh([{ type: 'customer-billing', customerId }, 'billing']);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Natverksfel');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      title="Skapa engangsfaktura"
      centered
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Faktureras separat och skickas direkt via Stripe. Pending invoice items
          dras inte in i detta flode.
        </Text>

        <Alert icon={<Info size={16} />} color="blue">
          For tillagg till nasta abonnemangsfaktura, anvand <strong>Lagg till rad</strong> i
          vantande poster i stallet.
        </Alert>

        <Stack gap="sm">
          {lines.map((line, index) => (
            <Group key={line.id} align="flex-end" wrap="nowrap">
              <TextInput
                label={index === 0 ? 'Beskrivning' : undefined}
                value={line.description}
                onChange={(event) =>
                  updateLine(line.id, { description: event.currentTarget.value })
                }
                maxLength={200}
                placeholder="Installationsavgift"
                required
                style={{ flex: 1 }}
              />
              <NumberInput
                label={index === 0 ? 'Belopp (kr)' : undefined}
                min={1}
                step={1}
                value={line.amountKr}
                onChange={(value) => updateLine(line.id, { amountKr: value })}
                required
                style={{ width: 140 }}
              />
              <Button
                variant="subtle"
                color="gray"
                onClick={() => removeLine(line.id)}
                aria-label={`Ta bort rad ${index + 1}`}
                disabled={submitting}
              >
                <Trash2 size={16} />
              </Button>
            </Group>
          ))}
        </Stack>

        <Group justify="space-between">
          <Button
            variant="light"
            leftSection={<Plus size={16} />}
            onClick={addLine}
            disabled={submitting}
          >
            Lagg till rad
          </Button>
          <Text size="sm" fw={600}>
            Total: {totalKr.toLocaleString('sv-SE')} kr
          </Text>
        </Group>

        <NumberInput
          label="Forfaller om (dagar)"
          min={1}
          max={90}
          step={1}
          value={daysUntilDue}
          onChange={setDaysUntilDue}
          required
        />

        <Group justify="flex-end" mt="md">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Avbryt
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} loading={submitting}>
            Skapa och skicka
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
