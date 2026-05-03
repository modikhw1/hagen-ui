'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
} from 'lucide-react';
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

const STEPS = ['Anledning', 'Omfattning', 'Avstämning', 'Granska'] as const;
type StepIndex = 0 | 1 | 2 | 3;

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `wiz-${crypto.randomUUID()}`;
  }
  return `wiz-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CreditReissueWizard({
  invoiceId,
  customerId,
  invoiceStatus,
  defaultAmountOre,
  currency: _currency,
  lines,
  hasActiveSubscription,
  canRefundPaymentMethod,
  onCompleted,
}: CreditReissueWizardProps) {
  // Wizard-state
  const [step, setStep] = useState<StepIndex>(0);

  // Steg 1 — anledning + memo
  const [mode, setMode] = useState<AdjustmentMode>('credit_only');
  const [reason, setReason] = useState<string>('order_change');
  const [memo, setMemo] = useState('');

  // Steg 2 — omfattning + belopp
  const [scope, setScope] = useState<CreditScope>('invoice');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [amountKr, setAmountKr] = useState<string | number>(
    String(Math.round(defaultAmountOre / 100)),
  );

  // Steg 3 — avstämning + (ev) ny faktura
  const [settlementMode, setSettlementMode] =
    useState<SettlementMode>('customer_balance');
  const [newAmountKr, setNewAmountKr] = useState<string | number>(
    String(Math.round(defaultAmountOre / 100)),
  );
  const [newDescription, setNewDescription] = useState('');

  // Submit-state
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<
    | null
    | {
        ok: boolean;
        replayed?: boolean;
        operationId?: string | null;
        requiresAttention?: boolean;
        message: string;
      }
  >(null);

  // Idempotency-key — låst per wizard-session så retries dedupliceras av backend
  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey());

  // Om wizarden öppnas mot ett nytt invoiceId, rotera key
  useEffect(() => {
    idempotencyKeyRef.current = generateIdempotencyKey();
    setLastResult(null);
  }, [invoiceId]);

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
  const step0Valid = !!mode && !!reason;
  const step1Valid = (() => {
    if (mode === 'cancel_subscription') {
      return Number.isFinite(amountOre) && amountOre > 0;
    }
    if (!Number.isFinite(amountOre) || amountOre <= 0) return false;
    if (amountOre > maxCreditOre) return false;
    if (scope === 'line' && !selectedLineId) return false;
    return true;
  })();
  const step2Valid = (() => {
    if (mode === 'credit_and_reissue') {
      if (!Number.isFinite(newAmountOre) || newAmountOre <= 0) return false;
      if (!newDescription.trim()) return false;
    }
    return true;
  })();

  const stepValid: Record<StepIndex, boolean> = {
    0: step0Valid,
    1: step1Valid,
    2: step2Valid,
    3: true,
  };

  function syncAmountToLine(lineId: string | null) {
    const line = lines.find((entry) => entry.id === lineId);
    if (!line) return;
    setAmountKr(String(Math.round(Math.abs(line.amount) / 100)));
  }

  function rotateKeyAndReset() {
    idempotencyKeyRef.current = generateIdempotencyKey();
    setLastResult(null);
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
            idempotency_key: idempotencyKeyRef.current,
          }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error ?? `HTTP ${res.status}`);
        setLastResult({
          ok: true,
          replayed: Boolean(result.replayed),
          operationId: result.operation_id ?? null,
          message: result.replayed
            ? 'Återanvände tidigare avslut + kredit (idempotent).'
            : 'Abonnemang avslutat och kreditering skapad.',
        });
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
                idempotency_key: idempotencyKeyRef.current,
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
                idempotency_key: idempotencyKeyRef.current,
              };
        const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error ?? `HTTP ${res.status}`);

        if (result.requires_attention) {
          setLastResult({
            ok: false,
            requiresAttention: true,
            operationId: result.operation_id ?? null,
            message:
              'Kreditnota skapad — ersättningsfakturan misslyckades och kräver uppföljning.',
          });
          toast.error(
            'Kreditnota skapad men ersättningsfakturan behövde manuell uppföljning.',
          );
        } else {
          const baseMsg =
            mode === 'credit_and_reissue'
              ? 'Kreditnota och ersättningsfaktura skapade.'
              : 'Kreditnota skapad.';
          setLastResult({
            ok: true,
            replayed: Boolean(result.replayed),
            operationId: result.operation_id ?? null,
            message: result.replayed
              ? 'Återanvände tidigare operation (idempotent replay).'
              : baseMsg,
          });
          toast.success(baseMsg);
        }
      }
      await onCompleted();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Nätverksfel';
      setLastResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // Hoppa avstämnings-steget när det inte är applicerbart
  function nextStep() {
    setStep((current) => {
      let next = (current + 1) as StepIndex;
      // Steg 2 (avstämning) är bara meningsfullt för paid + credit-flöden,
      // eller för credit_and_reissue (där vi alltid behöver "ny faktura"-fält)
      const skipSettlement =
        next === 2 &&
        !isPaidInvoice &&
        mode !== 'credit_and_reissue';
      if (skipSettlement) next = 3;
      return Math.min(3, next) as StepIndex;
    });
  }

  function prevStep() {
    setStep((current) => {
      let prev = (current - 1) as StepIndex;
      const skipSettlement =
        prev === 2 && !isPaidInvoice && mode !== 'credit_and_reissue';
      if (skipSettlement) prev = 1;
      return Math.max(0, prev) as StepIndex;
    });
  }

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-2 text-xs">
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

      {/* STEG 0 — Anledning */}
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

          <Select
            label="Anledning"
            value={reason}
            onChange={(value) => setReason(value || 'order_change')}
            data={Object.entries(REASON_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
          />

          <Textarea
            label="Intern notering (valfri)"
            value={memo}
            onChange={(event) => setMemo(event.currentTarget.value)}
            rows={2}
            maxLength={2000}
          />
        </div>
      )}

      {/* STEG 1 — Omfattning + belopp */}
      {step === 1 && (
        <div className="space-y-4">
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

          {mode === 'cancel_subscription' ? (
            <Alert color="yellow" icon={<AlertTriangle className="h-4 w-4" />}>
              Detta avslutar kundens aktiva abonnemang direkt.
            </Alert>
          ) : isOpenInvoice ? (
            <Alert color="blue">
              På en öppen faktura minskar kreditnotan kvarvarande belopp. Blir
              totalen 0 markeras fakturan som betald.
            </Alert>
          ) : null}
        </div>
      )}

      {/* STEG 2 — Avstämning + ev. ersättning */}
      {step === 2 && (
        <div className="space-y-4">
          {isPaidInvoice && (
            <Radio.Group
              value={resolvedSettlementMode}
              onChange={(value) => setSettlementMode(value as SettlementMode)}
              label="Hur ska krediten regleras?"
              description="Fakturan är redan betald — krediten måste landa någonstans."
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

          {!isPaidInvoice && mode !== 'credit_and_reissue' && (
            <Alert color="gray">
              Inget att stämma av — krediten minskar fakturans belopp direkt.
            </Alert>
          )}
        </div>
      )}

      {/* STEG 3 — Granska */}
      {step === 3 && (
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

          <p className="text-[11px] text-muted-foreground">
            Idempotens-nyckel:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
              {idempotencyKeyRef.current}
            </code>
          </p>

          {lastResult && (
            <Alert
              color={
                lastResult.requiresAttention
                  ? 'red'
                  : lastResult.ok
                    ? lastResult.replayed
                      ? 'blue'
                      : 'green'
                    : 'red'
              }
              icon={
                lastResult.ok && !lastResult.requiresAttention ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )
              }
              title={
                lastResult.requiresAttention
                  ? 'Behöver uppföljning'
                  : lastResult.ok
                    ? lastResult.replayed
                      ? 'Idempotent replay'
                      : 'Klart'
                    : 'Misslyckades'
              }
            >
              <div className="space-y-2">
                <p>{lastResult.message}</p>
                {lastResult.operationId && (
                  <p className="text-xs">
                    Operations-ID:{' '}
                    <code>{lastResult.operationId}</code>
                  </p>
                )}
                {(lastResult.requiresAttention || !lastResult.ok) && (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<RotateCcw className="h-3 w-3" />}
                    onClick={rotateKeyAndReset}
                  >
                    Försök igen med ny nyckel
                  </Button>
                )}
              </div>
            </Alert>
          )}

          {!lastResult && (
            <Alert color="blue">
              Klicka <em>Bekräfta</em> för att utföra åtgärden i Stripe. Operationen
              är idempotent — om något bryter mitt i kan du klicka igen utan att
              skapa dubbletter.
            </Alert>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <Button
          variant="subtle"
          size="sm"
          disabled={step === 0 || submitting}
          onClick={prevStep}
          leftSection={<ChevronLeft className="h-4 w-4" />}
        >
          Tillbaka
        </Button>

        {step < 3 ? (
          <Button
            size="sm"
            disabled={!stepValid[step]}
            onClick={nextStep}
            rightSection={<ChevronRight className="h-4 w-4" />}
          >
            Nästa
          </Button>
        ) : (
          <Button
            size="sm"
            color={mode === 'cancel_subscription' ? 'red' : undefined}
            disabled={submitting || (lastResult?.ok && !lastResult.requiresAttention)}
            onClick={submit}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {lastResult?.ok && !lastResult.requiresAttention
              ? 'Klart'
              : mode === 'cancel_subscription'
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
