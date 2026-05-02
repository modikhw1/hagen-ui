'use client';

import { useMemo, useState } from 'react';
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  Alert,
  Button,
  NumberInput,
  Radio,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { cn } from '@/lib/utils';

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

export interface CreditReissueWizardProps {
  invoiceId: string;
  customerId: string;
  invoiceStatus: string;
  defaultAmountOre: number;
  currency: string;
  lines: InvoiceLine[];
  hasActiveSubscription: boolean;
  canRefundPaymentMethod: boolean;
  onCompleted: () => Promise<void>;
}

function fmtKr(amountOre: number): string {
  return `${Math.round(amountOre / 100).toLocaleString('sv-SE')} kr`;
}

const REASON_LABEL: Record<string, string> = {
  order_change: 'Ändring av order',
  duplicate: 'Dubblett',
  fraudulent: 'Bedräglig',
  product_unsatisfactory: 'Produkt ej tillfredsställande',
};

const SETTLEMENT_LABEL: Record<SettlementMode, string> = {
  refund: 'Återbetala till kundens betalmetod',
  customer_balance: 'Lägg som kundsaldo för framtida fakturor',
  outside_stripe: 'Reglerad utanför Stripe',
};

const STEPS = ['Åtgärd', 'Detaljer', 'Granska'] as const;

export function CreditReissueWizard({
  invoiceId,
  customerId,
  invoiceStatus,
  defaultAmountOre,
  currency,
  lines,
  hasActiveSubscription,
  canRefundPaymentMethod,
  onCompleted,
}: CreditReissueWizardProps) {
  // Wizard-state
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [mode, setMode] = useState<AdjustmentMode>('credit_only');
  const [scope, setScope] = useState<CreditScope>('invoice');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  // Detaljer
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

  const isPaidInvoice = invoiceStatus === 'paid';
  const isOpenInvoice = invoiceStatus === 'open';
  const resolvedSettlementMode: SettlementMode =
    !canRefundPaymentMethod && settlementMode === 'refund'
      ? 'customer_balance'
      : settlementMode;

  const selectedLine = lines.find((l) => l.id === selectedLineId) ?? null;
  const maxCreditOre =
    scope === 'line' && selectedLine
      ? Math.abs(selectedLine.amount)
      : defaultAmountOre;

  const amountOre = Math.round(Number(amountKr) * 100);
  const newAmountOre = Math.round(Number(newAmountKr) * 100);

  const lineOptions = useMemo(
    () =>
      lines.map((line) => ({
        value: line.id,
        label: `${line.description} (${fmtKr(Math.abs(line.amount))})`,
      })),
    [lines],
  );

  const modeOptions: Array<{
    value: AdjustmentMode;
    label: string;
    description: string;
  }> = [
    {
      value: 'credit_only',
      label: 'Kreditera faktura eller rad',
      description: 'För missnöjda extrarader eller goodwill.',
    },
    {
      value: 'credit_and_reissue',
      label: 'Kreditera och ersättningsfakturera',
      description: 'Kreditera och skapa direkt en ny korrigerad faktura.',
    },
  ];
  if (hasActiveSubscription) {
    modeOptions.push({
      value: 'cancel_subscription',
      label: 'Avsluta abonnemang och kreditera',
      description: 'Säger upp aktivt abonnemang och krediterar samtidigt.',
    });
  }

  // Validation per steg
  const step0Valid = !!mode;
  const step1Valid = (() => {
    if (!Number.isFinite(amountOre) || amountOre <= 0) return false;
    if (amountOre > maxCreditOre && mode !== 'cancel_subscription') return false;
    if (scope === 'line' && !selectedLineId && mode !== 'cancel_subscription')
      return false;
    if (mode === 'credit_and_reissue') {
      if (!Number.isFinite(newAmountOre) || newAmountOre <= 0) return false;
      if (!newDescription.trim()) return false;
    }
    return true;
  })();

  function syncAmountToLine(lineId: string | null) {
    const line = lines.find((entry) => entry.id === lineId);
    if (!line) return;
    setAmountKr(String(Math.round(Math.abs(line.amount) / 100)));
  }

  async function submit() {
    setSubmitting(true);
    try {
      if (mode === 'cancel_subscription') {
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
        if (!res.ok) throw new Error(result.error ?? `HTTP ${res.status}`);
        toast.success('Abonnemang avslutat och kreditering skapad.');
      } else {
        const body =
          mode === 'credit_and_reissue'
            ? {
                action: 'credit_note_and_reissue' as const,
                reason,
                memo: memo.trim() || undefined,
                amount_ore: amountOre,
                stripe_line_item_id:
                  scope === 'line' ? selectedLineId ?? undefined : undefined,
                settlement_mode: isPaidInvoice
                  ? resolvedSettlementMode
                  : undefined,
                new_amount_ore: newAmountOre,
                new_description: newDescription.trim(),
              }
            : {
                action: 'credit_note_only' as const,
                reason,
                memo: memo.trim() || undefined,
                amount_ore: amountOre,
                stripe_line_item_id:
                  scope === 'line' ? selectedLineId ?? undefined : undefined,
                settlement_mode: isPaidInvoice
                  ? resolvedSettlementMode
                  : undefined,
              };
        const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error ?? `HTTP ${res.status}`);

        if (result.requires_attention) {
          toast.error(
            'Kreditnota skapad men ersättningsfakturan behövde manuell uppföljning.',
          );
        } else if (mode === 'credit_and_reissue') {
          toast.success('Kreditnota och ersättningsfaktura skapade.');
        } else {
          toast.success('Kreditnota skapad.');
        }
      }
      await onCompleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nätverksfel');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Stepper-indikator */}
      <ol className="flex items-center gap-2 text-xs">
        {STEPS.map((label, index) => {
          const isActive = index === step;
          const isDone = index < step;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-medium',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : isDone
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground',
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  'font-medium',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
              {index < STEPS.length - 1 && (
                <span className="mx-2 h-px w-6 bg-border" />
              )}
            </li>
          );
        })}
      </ol>

      {/* STEG 0 — välj åtgärd */}
      {step === 0 && (
        <div className="space-y-4">
          <Radio.Group
            value={mode}
            onChange={(value) => setMode(value as AdjustmentMode)}
            label="Vilken åtgärd vill du göra?"
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

          {mode !== 'cancel_subscription' && (
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
          )}

          {scope === 'line' && mode !== 'cancel_subscription' && (
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
        </div>
      )}

      {/* STEG 1 — detaljer */}
      {step === 1 && (
        <div className="space-y-4">
          <Select
            label="Anledning"
            value={reason}
            onChange={(value) => setReason(value || 'order_change')}
            data={Object.entries(REASON_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
          />

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
            description={
              mode !== 'cancel_subscription'
                ? `Max ${fmtKr(maxCreditOre)}`
                : undefined
            }
            error={
              amountOre > maxCreditOre && mode !== 'cancel_subscription'
                ? 'Beloppet överstiger valt underlag'
                : undefined
            }
          />

          {isPaidInvoice && (
            <Radio.Group
              value={resolvedSettlementMode}
              onChange={(value) => setSettlementMode(value as SettlementMode)}
              label="Hur ska krediten hanteras?"
            >
              <Stack mt="xs" gap="xs">
                {canRefundPaymentMethod && (
                  <Radio value="refund" label={SETTLEMENT_LABEL.refund} />
                )}
                <Radio
                  value="customer_balance"
                  label={SETTLEMENT_LABEL.customer_balance}
                />
                <Radio
                  value="outside_stripe"
                  label={SETTLEMENT_LABEL.outside_stripe}
                />
              </Stack>
            </Radio.Group>
          )}

          {mode === 'credit_and_reissue' && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Ny ersättningsfaktura
              </p>
              <NumberInput
                label="Nytt fakturabelopp (kr)"
                min={1}
                step={1}
                value={newAmountKr}
                onChange={setNewAmountKr}
              />
              <TextInput
                label="Beskrivning"
                value={newDescription}
                onChange={(event) => setNewDescription(event.currentTarget.value)}
                placeholder="Korrigerat månadsbelopp"
                maxLength={500}
              />
            </div>
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
              Detta avslutar kundens aktiva abonnemang direkt.
            </Alert>
          ) : isOpenInvoice ? (
            <Alert color="blue">
              På en öppen faktura minskar kreditnotan kvarvarande belopp. Blir
              totalen 0 markeras fakturan som betald.
            </Alert>
          ) : (
            <Alert color="yellow" icon={<AlertTriangle className="h-4 w-4" />}>
              På en betald faktura måste krediten landa som refund, kundsaldo
              eller reglering utanför Stripe.
            </Alert>
          )}
        </div>
      )}

      {/* STEG 2 — granska */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Sammanfattning
            </h3>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Åtgärd</dt>
              <dd className="font-medium text-foreground">
                {modeOptions.find((m) => m.value === mode)?.label}
              </dd>

              {mode !== 'cancel_subscription' && (
                <>
                  <dt className="text-muted-foreground">Omfattning</dt>
                  <dd className="font-medium text-foreground">
                    {scope === 'invoice'
                      ? 'Hela fakturan'
                      : selectedLine?.description ?? '—'}
                  </dd>
                </>
              )}

              <dt className="text-muted-foreground">Anledning</dt>
              <dd className="font-medium text-foreground">
                {REASON_LABEL[reason] ?? reason}
              </dd>

              <dt className="text-muted-foreground">Kreditbelopp</dt>
              <dd className="font-semibold text-destructive tabular-nums">
                −{fmtKr(amountOre)}
              </dd>

              {isPaidInvoice && (
                <>
                  <dt className="text-muted-foreground">Avstämning</dt>
                  <dd className="font-medium text-foreground">
                    {SETTLEMENT_LABEL[resolvedSettlementMode]}
                  </dd>
                </>
              )}

              {mode === 'credit_and_reissue' && (
                <>
                  <dt className="text-muted-foreground">Ny faktura</dt>
                  <dd className="font-semibold text-emerald-600 tabular-nums">
                    +{fmtKr(newAmountOre)}
                  </dd>
                  <dt className="text-muted-foreground">Beskrivning</dt>
                  <dd className="font-medium text-foreground">
                    {newDescription || '—'}
                  </dd>
                </>
              )}

              {memo && (
                <>
                  <dt className="text-muted-foreground">Notering</dt>
                  <dd className="text-foreground">{memo}</dd>
                </>
              )}
            </dl>
          </div>

          {mode === 'credit_and_reissue' && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Nettoeffekt:</p>
              <p>
                −{fmtKr(amountOre)} (kreditnota) +{' '}
                {fmtKr(newAmountOre)} (ny faktura) ={' '}
                <span className="font-semibold text-foreground">
                  {newAmountOre - amountOre >= 0 ? '+' : ''}
                  {fmtKr(newAmountOre - amountOre)}
                </span>{' '}
                till kund
              </p>
            </div>
          )}

          <Alert color="blue">
            Klicka <em>Bekräfta</em> för att utföra åtgärden i Stripe. Det går
            inte att ångra automatiskt — en ny kredit eller faktura krävs för
            att rätta misstag.
          </Alert>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <Button
          variant="subtle"
          size="sm"
          disabled={step === 0 || submitting}
          onClick={() => setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2)}
          leftSection={<ChevronLeft className="h-4 w-4" />}
        >
          Tillbaka
        </Button>

        {step < 2 ? (
          <Button
            size="sm"
            disabled={(step === 0 && !step0Valid) || (step === 1 && !step1Valid)}
            onClick={() => setStep((s) => Math.min(2, s + 1) as 0 | 1 | 2)}
            rightSection={<ChevronRight className="h-4 w-4" />}
          >
            Nästa
          </Button>
        ) : (
          <Button
            size="sm"
            color={mode === 'cancel_subscription' ? 'red' : undefined}
            disabled={submitting}
            onClick={submit}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'cancel_subscription'
              ? 'Bekräfta avslut + kredit'
              : mode === 'credit_and_reissue'
                ? 'Bekräfta kredit + ny faktura'
                : 'Bekräfta kreditnota'}
          </Button>
        )}
      </div>
    </div>
  );
}