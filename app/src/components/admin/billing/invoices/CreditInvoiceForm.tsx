'use client';

import { useMemo, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Alert,
  Button,
  NumberInput,
  Radio,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';

type AdjustmentMode =
  | 'credit_only'
  | 'credit_and_reissue'
  | 'cancel_subscription';
type CreditScope = 'invoice' | 'line';
type SettlementMode = 'refund' | 'customer_balance' | 'outside_stripe';

type InvoiceLine = {
  id: string;
  description: string;
  amount: number;
  quantity: number;
};

export interface CreditInvoiceFormProps {
  invoiceId: string;
  customerId: string;
  invoiceStatus: string;
  defaultAmountOre: number;
  lines: InvoiceLine[];
  hasActiveSubscription: boolean;
  canRefundPaymentMethod: boolean;
  onCompleted: () => Promise<void>;
}

function formatAmountOre(amountOre: number) {
  return `${Math.round(amountOre / 100).toLocaleString('sv-SE')} kr`;
}

export function CreditInvoiceForm({
  invoiceId,
  customerId,
  invoiceStatus,
  defaultAmountOre,
  lines,
  hasActiveSubscription,
  canRefundPaymentMethod,
  onCompleted,
}: CreditInvoiceFormProps) {
  const [mode, setMode] = useState<AdjustmentMode>('credit_only');
  const [scope, setScope] = useState<CreditScope>('invoice');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('order_change');
  const [memo, setMemo] = useState('');
  const [amountKr, setAmountKr] = useState<string | number>(
    String(Math.round(defaultAmountOre / 100)),
  );
  const [newAmountKr, setNewAmountKr] = useState<string | number>(
    String(Math.round(defaultAmountOre / 100)),
  );
  const [newDescription, setNewDescription] = useState('');
  const [settlementMode, setSettlementMode] =
    useState<SettlementMode>('customer_balance');
  const [submitting, setSubmitting] = useState(false);
  const [autoReissue, setAutoReissue] = useState(false);

  const isPaidInvoice = invoiceStatus === 'paid';
  const isOpenInvoice = invoiceStatus === 'open';
  const resolvedSettlementMode =
    !canRefundPaymentMethod && settlementMode === 'refund'
      ? 'customer_balance'
      : settlementMode;
  const selectedLine =
    lines.find((line) => line.id === selectedLineId) ?? null;
  const maxCreditOre =
    scope === 'line' && selectedLine
      ? Math.abs(selectedLine.amount)
      : defaultAmountOre;

  const lineOptions = useMemo(
    () =>
      lines.map((line) => ({
        value: line.id,
        label: `${line.description} (${formatAmountOre(Math.abs(line.amount))})`,
      })),
    [lines],
  );

  const modeOptions = [
    {
      value: 'credit_only',
      label: 'Kreditera faktura eller rad',
      description:
        'For missnojda extrarader eller goodwill. Valj hela fakturan eller en specifik rad.',
    },
    {
      value: 'credit_and_reissue',
      label: 'Kreditera och ersattningsfakturera',
      description:
        'Kreditera gammalt underlag och skapa direkt en ny korrigerad faktura.',
    },
  ];
  if (hasActiveSubscription) {
    modeOptions.push({
      value: 'cancel_subscription',
      label: 'Avsluta abonnemang och kreditera',
      description:
        'Sager upp aktivt abonnemang direkt och krediterar vald faktura samtidigt.',
    });
  }

  function syncAmountToLine(lineId: string | null) {
    const line = lines.find((entry) => entry.id === lineId);
    if (!line) return;
    const roundedKr = Math.round(Math.abs(line.amount) / 100);
    setAmountKr(String(roundedKr));
  }

  async function handleAdjustInvoice() {
    const amountOre = Math.round(Number(amountKr) * 100);
    if (!Number.isFinite(amountOre) || amountOre <= 0) {
      toast.error('Ange ett kreditbelopp over 0.');
      return;
    }
    if (scope === 'line' && !selectedLineId) {
      toast.error('Valj fakturaraden som ska krediteras.');
      return;
    }
    if (amountOre > maxCreditOre) {
      toast.error('Kreditbeloppet far inte overstiga valt belopp.');
      return;
    }

    if (mode === 'credit_and_reissue') {
      const replacementOre = Math.round(Number(newAmountKr) * 100);
      if (
        !newDescription.trim() ||
        !Number.isFinite(replacementOre) ||
        replacementOre <= 0
      ) {
        toast.error(
          'Ange nytt belopp och beskrivning for ersattningsfakturan.',
        );
        return;
      }
    }

    const body =
      mode === 'credit_and_reissue'
        ? {
            action: 'credit_note_and_reissue' as const,
            reason,
            memo: memo.trim() || undefined,
            amount_ore: amountOre,
            stripe_line_item_id:
              scope === 'line' ? selectedLineId ?? undefined : undefined,
            settlement_mode: isPaidInvoice ? resolvedSettlementMode : undefined,
            new_amount_ore: Math.round(Number(newAmountKr) * 100),
            new_description: newDescription.trim(),
          }
        : {
            action: 'credit_note_only' as const,
            reason,
            memo: memo.trim() || undefined,
            amount_ore: amountOre,
            stripe_line_item_id:
              scope === 'line' ? selectedLineId ?? undefined : undefined,
            settlement_mode: isPaidInvoice ? resolvedSettlementMode : undefined,
          };

    const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error ?? `HTTP ${res.status}`);
    }

    if (result.requires_attention) {
      toast.error(
        'Kreditnota skapad men ersattningsfakturan behovde manuell uppfoljning.',
      );
    } else if (mode === 'credit_and_reissue') {
      toast.success('Kreditnota och ersattningsfaktura skapade.');
    } else {
      toast.success('Kreditnota skapad.');
    }
  }

  async function handleCancelSubscription() {
    const amountOre = Math.round(Number(amountKr) * 100);
    if (!Number.isFinite(amountOre) || amountOre <= 0) {
      toast.error('Ange ett kreditbelopp over 0.');
      return;
    }

    const res = await fetch(`/api/admin/customers/${customerId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'immediate_with_credit',
        invoice_id: invoiceId,
        credit_amount_ore: amountOre,
        memo: memo.trim() || undefined,
        reason,
        credit_settlement_mode: isPaidInvoice
          ? resolvedSettlementMode
          : undefined,
      }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error ?? `HTTP ${res.status}`);
    }

    toast.success('Abonnemang avslutat och kreditering skapad.');
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      if (mode === 'cancel_subscription') {
        await handleCancelSubscription();
      } else {
        await handleAdjustInvoice();
      }
      await onCompleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Natverksfel');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Radio.Group
        value={mode}
        onChange={(value) => setMode(value as AdjustmentMode)}
        label="Use case"
      >
        <Stack mt="xs" gap="xs">
          {modeOptions.map((option) => (
            <Radio
              key={option.value}
              value={option.value}
              label={
                <div>
                  <Text size="sm" fw={500}>
                    {option.label}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {option.description}
                  </Text>
                </div>
              }
            />
          ))}
        </Stack>
      </Radio.Group>

      <Select
        label="Anledning"
        value={reason}
        onChange={(value) => setReason(value || 'order_change')}
        data={[
          { value: 'order_change', label: 'Andring av order' },
          { value: 'duplicate', label: 'Dubblett' },
          { value: 'fraudulent', label: 'Bedraglig' },
          {
            value: 'product_unsatisfactory',
            label: 'Produkt ej tillfredsstallande',
          },
        ]}
      />

      {mode !== 'cancel_subscription' && (
        <>
          <Radio.Group
            value={scope}
            onChange={(value) => {
              const nextScope = value as CreditScope;
              setScope(nextScope);
              if (nextScope === 'invoice') {
                setSelectedLineId(null);
                setAmountKr(String(Math.round(defaultAmountOre / 100)));
              }
            }}
            label="Vad ska krediteras?"
          >
            <Stack mt="xs" gap="xs">
              <Radio
                value="invoice"
                label="Hela fakturan / valfritt totalbelopp"
              />
              <Radio value="line" label="En specifik fakturarad" />
            </Stack>
          </Radio.Group>

          {scope === 'line' && (
            <Select
              label="Fakturarad"
              value={selectedLineId}
              onChange={(value) => {
                setSelectedLineId(value);
                syncAmountToLine(value);
              }}
              data={lineOptions}
              placeholder="Valj rad"
            />
          )}
        </>
      )}

      <NumberInput
        label={
          mode === 'cancel_subscription'
            ? 'Kreditbelopp vid avslut (kr)'
            : 'Kreditbelopp (kr)'
        }
        min={1}
        step={1}
        value={amountKr}
        onChange={setAmountKr}
      />

      {isPaidInvoice && (
        <Radio.Group
          value={resolvedSettlementMode}
          onChange={(value) => setSettlementMode(value as SettlementMode)}
          label="Hur ska krediten hanteras?"
        >
          <Stack mt="xs" gap="xs">
            {canRefundPaymentMethod && (
              <Radio
                value="refund"
                label="Aterbetala till kundens betalmetod"
              />
            )}
            <Radio
              value="customer_balance"
              label="Lagg som kundsaldo for framtida fakturor"
            />
            <Radio
              value="outside_stripe"
              label="Markerad som reglerad utanfor Stripe"
            />
          </Stack>
        </Radio.Group>
      )}

      {mode === 'credit_and_reissue' && (
        <>
          <Alert color="blue">
            Den nya fakturan skapas separat och skickas via Stripe utan att dra
            in orelaterade pending invoice items.
          </Alert>
          <NumberInput
            label="Nytt fakturabelopp (kr)"
            min={1}
            step={1}
            value={newAmountKr}
            onChange={setNewAmountKr}
          />
          <TextInput
            label="Ny beskrivning"
            value={newDescription}
            onChange={(event) => setNewDescription(event.currentTarget.value)}
            placeholder="Korrigerat manadsbelopp"
            maxLength={500}
          />
        </>
      )}

      {mode === 'credit_only' && (
        <Switch
          checked={autoReissue}
          onChange={(event) => setAutoReissue(event.currentTarget.checked)}
          label="Skapa i stallet en korrigerad ersattningsfaktura efter kreditering"
        />
      )}

      {autoReissue && mode === 'credit_only' && (
        <>
          <Alert color="blue">
            Du har slagit pa ersattningsfaktura. Formularet byter till samma
            flode som Kreditera och ersattningsfakturera.
          </Alert>
          <Button
            variant="light"
            onClick={() => setMode('credit_and_reissue')}
          >
            Byt till ersattningsflode
          </Button>
        </>
      )}

      <Textarea
        label="Intern notering"
        value={memo}
        onChange={(event) => setMemo(event.currentTarget.value)}
        rows={2}
        maxLength={2000}
      />

      {mode === 'cancel_subscription' ? (
        <Alert color="yellow" icon={<AlertTriangle className="h-4 w-4" />}>
          Detta avslutar kundens aktiva abonnemang direkt och krediterar vald
          faktura i samma flode.
        </Alert>
      ) : isOpenInvoice ? (
        <Alert color="blue">
          Pa en oppen faktura minskar kreditnotan det kvarvarande beloppet. Om
          totalen blir 0 markerar Stripe fakturan som betald.
        </Alert>
      ) : (
        <Alert color="yellow" icon={<AlertTriangle className="h-4 w-4" />}>
          Pa en betald faktura maste krediten landa som refund, kundsaldo eller
          reglering utanfor Stripe.
        </Alert>
      )}

      <Button onClick={handleSubmit} disabled={submitting} className="w-full">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {mode === 'cancel_subscription'
          ? 'Avsluta abonnemang och kreditera'
          : mode === 'credit_and_reissue'
            ? 'Kreditera och skapa ersattningsfaktura'
            : 'Skapa kreditnota'}
      </Button>
    </div>
  );
}
