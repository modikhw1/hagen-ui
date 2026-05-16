// @ts-nocheck
'use client';

import { useEffect, useMemo, useState } from 'react';
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
  Tooltip,
} from '@mantine/core';

import { apiClient, ApiError, callCustomerAction } from '@/lib/admin/api-client';

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
  /** ISO-4217, default 'sek'. Se AVTAL_AUDIT.md (#A8-D17). */
  currency?: string;
  onCompleted: () => Promise<void>;
  /** Stänger föräldermodalen efter lyckad submit. Se AVTAL_AUDIT.md (#A8-D22). */
  onSuccess?: () => void;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function formatAmountOre(amountOre: number, currency: string) {
  try {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(Math.round(amountOre / 100));
  } catch {
    return `${Math.round(amountOre / 100).toLocaleString('sv-SE')} ${currency.toUpperCase()}`;
  }
}

export function CreditInvoiceForm({
  invoiceId,
  customerId,
  invoiceStatus,
  defaultAmountOre,
  lines,
  hasActiveSubscription,
  canRefundPaymentMethod,
  currency = 'sek',
  onCompleted,
  onSuccess,
}: CreditInvoiceFormProps) {
  const [mode, setMode] = useState<AdjustmentMode>('credit_only');
  const [scope, setScope] = useState<CreditScope>('invoice');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  // Default '' — operatören måste aktivt välja anledning.
  // Se AVTAL_AUDIT.md (#A8-D18).
  const [reason, setReason] = useState<string>('');
  const [memo, setMemo] = useState('');
  const [amountKr, setAmountKr] = useState<string | number>(
    String(Math.round(defaultAmountOre / 100)),
  );
  const [newAmountKr, setNewAmountKr] = useState<string | number>(
    String(Math.round(defaultAmountOre / 100)),
  );
  const [newDescription, setNewDescription] = useState('');
  const [settlementMode, setSettlementMode] = useState<SettlementMode>(
    canRefundPaymentMethod ? 'refund' : 'customer_balance',
  );
  const [submitting, setSubmitting] = useState(false);
  const [autoReissue, setAutoReissue] = useState(false);
  // Idempotency-key per form-instans, regen vid mode/amount/scope-byte.
  // Se AVTAL_AUDIT.md (#A8-D12).
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateUuid());

  const isPaidInvoice = invoiceStatus === 'paid';
  const isOpenInvoice = invoiceStatus === 'open';

  // Auto-flippa till credit_and_reissue när autoReissue slås på.
  // Se AVTAL_AUDIT.md (#A8-D11, D23).
  useEffect(() => {
    if (autoReissue && mode === 'credit_only') {
      setMode('credit_and_reissue');
    }
  }, [autoReissue, mode]);

  // Rotera idempotensnyckel vid varje meningsfull intentionsändring.
  useEffect(() => {
    setIdempotencyKey(generateUuid());
  }, [mode, scope, amountKr, selectedLineId, settlementMode]);

  // Klampa settlementMode om kortet inte kan refundas — men visa det
  // visuellt (disablad radio + tooltip) i stället för att tysta. (D15)
  const effectiveSettlementMode: SettlementMode =
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
        label: `${line.description} (${formatAmountOre(Math.abs(line.amount), currency)})`,
      })),
    [lines, currency],
  );

  const modeOptions = [
    {
      value: 'credit_only',
      label: 'Kreditera faktura eller rad',
      description:
        'För missnöjda extrarader eller goodwill. Välj hela fakturan eller en specifik rad.',
    },
    {
      value: 'credit_and_reissue',
      label: 'Kreditera och ersättningsfakturera',
      description:
        'Kreditera gammalt underlag och skapa direkt en ny korrigerad faktura.',
    },
  ];
  if (hasActiveSubscription) {
    modeOptions.push({
      value: 'cancel_subscription',
      label: 'Avsluta abonnemang och kreditera',
      description:
        'Säger upp aktivt abonnemang direkt och krediterar vald faktura samtidigt.',
    });
  }

  function syncAmountToLine(lineId: string | null) {
    const line = lines.find((entry) => entry.id === lineId);
    if (!line) return;
    const roundedKr = Math.round(Math.abs(line.amount) / 100);
    setAmountKr(String(roundedKr));
  }

  function validateCommon(): { amountOre: number } | null {
    if (!reason) {
      toast.error('Välj en anledning.');
      return null;
    }
    const amountOre = Math.round(Number(amountKr) * 100);
    if (!Number.isFinite(amountOre) || amountOre <= 0) {
      toast.error('Ange ett kreditbelopp över 0.');
      return null;
    }
    if (amountOre > maxCreditOre) {
      toast.error(
        `Kreditbeloppet får inte överstiga ${formatAmountOre(maxCreditOre, currency)}.`,
      );
      return null;
    }
    return { amountOre };
  }

  async function handleAdjustInvoice() {
    const validation = validateCommon();
    if (!validation) return;
    const { amountOre } = validation;

    if (scope === 'line' && !selectedLineId) {
      toast.error('Välj fakturaraden som ska krediteras.');
      return;
    }

    if (mode === 'credit_and_reissue') {
      const replacementOre = Math.round(Number(newAmountKr) * 100);
      if (
        !newDescription.trim() ||
        !Number.isFinite(replacementOre) ||
        replacementOre <= 0
      ) {
        toast.error('Ange nytt belopp och beskrivning för ersättningsfakturan.');
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
            settlement_mode: isPaidInvoice ? effectiveSettlementMode : undefined,
            new_amount_ore: Math.round(Number(newAmountKr) * 100),
            new_description: newDescription.trim(),
            idempotency_key: idempotencyKey,
          }
        : {
            action: 'credit_note_only' as const,
            reason,
            memo: memo.trim() || undefined,
            amount_ore: amountOre,
            stripe_line_item_id:
              scope === 'line' ? selectedLineId ?? undefined : undefined,
            settlement_mode: isPaidInvoice ? effectiveSettlementMode : undefined,
            idempotency_key: idempotencyKey,
          };

    // Använd apiClient (Authorization + ApiError). Se AVTAL_AUDIT.md (#A8-D13).
    const result = await apiClient.patch<{ requires_attention?: boolean }>(
      `/api/admin/invoices/${invoiceId}`,
      body,
    );

    if (result?.requires_attention) {
      toast.warning(
        'Kreditnota skapad men ersättningsfakturan behövde manuell uppföljning.',
      );
    } else if (mode === 'credit_and_reissue') {
      toast.success('Kreditnota och ersättningsfaktura skapade.');
    } else {
      toast.success('Kreditnota skapad.');
    }
  }

  async function handleCancelSubscription() {
    const validation = validateCommon();
    if (!validation) return;
    const { amountOre } = validation;

    // Routea via dispatcher-mönstret (samma som A2/A5). Se AVTAL_AUDIT.md (#A8-D16).
    const result = await callCustomerAction(customerId, {
      action: 'cancel_subscription',
      mode: 'immediate_with_credit',
      invoice_id: invoiceId,
      credit_amount_ore: amountOre,
      memo: memo.trim() || undefined,
      reason: reason as
        | 'duplicate'
        | 'fraudulent'
        | 'order_change'
        | 'product_unsatisfactory',
      credit_settlement_mode: isPaidInvoice ? effectiveSettlementMode : undefined,
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    toast.success('Abonnemang avslutat och kreditering skapad.');
  }

  async function handleSubmit() {
    if (submitting) return; // dubbelklick-skydd utöver disabled
    setSubmitting(true);
    let didSucceed = false;
    try {
      if (mode === 'cancel_subscription') {
        await handleCancelSubscription();
      } else {
        await handleAdjustInvoice();
      }
      didSucceed = true;
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error(error instanceof Error ? error.message : 'Nätverksfel');
      }
    }

    if (didSucceed) {
      // Stäng modalen INNAN vi släpper submitting — annars kan operatören
      // hinna klicka igen. (D22)
      onSuccess?.();
      try {
        await onCompleted();
      } catch (refreshError) {
        // Lyckad operation men refresh failade — varna, inte error. (D21)
        console.warn('CreditInvoiceForm refresh failed', refreshError);
        toast.warning('Kreditering skapad men listan kunde inte uppdateras.');
      }
    }
    setSubmitting(false);
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
        value={reason || null}
        onChange={(value) => setReason(value ?? '')}
        placeholder="Välj anledning…"
        required
        data={[
          { value: 'order_change', label: 'Ändring av order' },
          { value: 'duplicate', label: 'Dubblett' },
          { value: 'fraudulent', label: 'Bedraglig' },
          {
            value: 'product_unsatisfactory',
            label: 'Produkt ej tillfredsställande',
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
              <Radio value="invoice" label="Hela fakturan / valfritt totalbelopp" />
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
              placeholder="Välj rad"
            />
          )}
        </>
      )}

      <NumberInput
        label={
          mode === 'cancel_subscription'
            ? `Kreditbelopp vid avslut (${currency.toUpperCase()})`
            : `Kreditbelopp (${currency.toUpperCase()})`
        }
        min={1}
        max={Math.round(maxCreditOre / 100)}
        step={1}
        value={amountKr}
        onChange={setAmountKr}
        description={`Max ${formatAmountOre(maxCreditOre, currency)} (faktura/rad-summa)`}
      />

      {isPaidInvoice && mode !== 'cancel_subscription' && (
        <Radio.Group
          value={effectiveSettlementMode}
          onChange={(value) => setSettlementMode(value as SettlementMode)}
          label="Hur ska krediten hanteras?"
        >
          <Stack mt="xs" gap="xs">
            <Tooltip
              label={
                canRefundPaymentMethod
                  ? ''
                  : 'Kortet kan inte återbetalas (utgånget eller ej tillgängligt).'
              }
              disabled={canRefundPaymentMethod}
              withArrow
            >
              <div>
                <Radio
                  value="refund"
                  label="Återbetala till kundens betalmetod"
                  disabled={!canRefundPaymentMethod}
                />
              </div>
            </Tooltip>
            <Radio
              value="customer_balance"
              label="Lägg som kundsaldo för framtida fakturor"
            />
            <Radio
              value="outside_stripe"
              label="Markerad som reglerad utanför Stripe"
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
            label={`Nytt fakturabelopp (${currency.toUpperCase()})`}
            min={1}
            step={1}
            value={newAmountKr}
            onChange={setNewAmountKr}
          />
          <TextInput
            label="Ny beskrivning"
            value={newDescription}
            onChange={(event) => setNewDescription(event.currentTarget.value)}
            placeholder="Korrigerat månadsbelopp"
            maxLength={500}
          />
        </>
      )}

      {mode === 'credit_only' && (
        <Switch
          checked={autoReissue}
          onChange={(event) => setAutoReissue(event.currentTarget.checked)}
          label="Skapa i stället en korrigerad ersättningsfaktura efter kreditering"
        />
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
          faktura i samma flöde.
        </Alert>
      ) : isOpenInvoice ? (
        <Alert color="blue">
          På en öppen faktura minskar kreditnotan det kvarvarande beloppet. Om
          totalen blir 0 markerar Stripe fakturan som betald.
        </Alert>
      ) : (
        <Alert color="yellow" icon={<AlertTriangle className="h-4 w-4" />}>
          På en betald faktura måste krediten landa som refund, kundsaldo eller
          reglering utanför Stripe.
        </Alert>
      )}

      <Button onClick={handleSubmit} disabled={submitting} className="w-full">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {mode === 'cancel_subscription'
          ? 'Avsluta abonnemang och kreditera'
          : mode === 'credit_and_reissue'
            ? 'Kreditera och skapa ersättningsfaktura'
            : 'Skapa kreditnota'}
      </Button>
    </div>
  );
}
