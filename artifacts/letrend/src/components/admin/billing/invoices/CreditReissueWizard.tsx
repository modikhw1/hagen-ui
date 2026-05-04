// @ts-nocheck
'use client';

import { useMemo, useState } from 'react';
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  adminModalAlertStyle,
  adminModalPrimaryButtonStyle,
  adminModalSecondaryButtonStyle,
  adminModalSectionStyle,
  ADMIN_MODAL_INPUT_CLS,
  ADMIN_MODAL_LABEL_CLS,
} from '@/components/admin/ui/adminModalTokens';
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

const radioLabelStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  cursor: 'pointer',
  fontSize: 12,
  color: '#4A2F18',
  lineHeight: 1.4,
};

const radioInputStyle: React.CSSProperties = {
  accentColor: '#4A2F18',
  marginTop: 2,
  flexShrink: 0,
  cursor: 'pointer',
};

const RADIO_CLS =
  'focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#4A2F18]';

const fieldHintStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#9D8E7D',
  marginTop: 2,
};

const fieldErrorStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#C53030',
  marginTop: 2,
};

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
                    ? 'border-[#4A2F18] bg-[#4A2F18] text-[#FAF8F5]'
                    : isDone
                      ? 'border-[rgba(74,47,24,0.25)] bg-[rgba(74,47,24,0.08)] text-[#4A2F18]'
                      : 'border-[rgba(74,47,24,0.1)] bg-[#FAF8F5] text-[#9D8E7D]',
                )}
              >
                {index + 1}
              </span>
              <span
                style={{
                  fontWeight: 500,
                  color: isActive ? '#4A2F18' : '#9D8E7D',
                }}
              >
                {label}
              </span>
              {index < STEPS.length - 1 && (
                <span
                  style={{
                    display: 'inline-block',
                    width: 24,
                    height: 1,
                    background: 'rgba(74,47,24,0.15)',
                    margin: '0 8px',
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* STEG 0 — välj åtgärd */}
      {step === 0 && (
        <div className="space-y-4">
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className={ADMIN_MODAL_LABEL_CLS} style={{ marginBottom: 6 }}>
              Vilken åtgärd vill du göra?
            </legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {modeOptions.map((option) => (
                <label key={option.value} style={radioLabelStyle}>
                  <input
                    type="radio"
                    name="wizard-mode"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={() => setMode(option.value as AdjustmentMode)}
                    style={radioInputStyle}
                    className={RADIO_CLS}
                  />
                  <span>
                    <span style={{ fontWeight: 500, display: 'block' }}>
                      {option.label}
                    </span>
                    <span style={{ fontSize: 11, color: '#9D8E7D' }}>
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {mode !== 'cancel_subscription' && (
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend className={ADMIN_MODAL_LABEL_CLS} style={{ marginBottom: 6 }}>
                Vad ska krediteras?
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={radioLabelStyle}>
                  <input
                    type="radio"
                    name="wizard-scope"
                    value="invoice"
                    checked={scope === 'invoice'}
                    onChange={() => {
                      setScope('invoice');
                      setSelectedLineId(null);
                      setAmountKr(String(Math.round(defaultAmountOre / 100)));
                    }}
                    style={radioInputStyle}
                    className={RADIO_CLS}
                  />
                  Hela fakturan / valfritt totalbelopp
                </label>
                <label style={radioLabelStyle}>
                  <input
                    type="radio"
                    name="wizard-scope"
                    value="line"
                    checked={scope === 'line'}
                    onChange={() => setScope('line')}
                    style={radioInputStyle}
                    className={RADIO_CLS}
                  />
                  En specifik fakturarad
                </label>
              </div>
            </fieldset>
          )}

          {scope === 'line' && mode !== 'cancel_subscription' && (
            <div style={adminModalSectionStyle}>
              <label className={ADMIN_MODAL_LABEL_CLS}>Fakturarad</label>
              <select
                className={ADMIN_MODAL_INPUT_CLS}
                value={selectedLineId ?? ''}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setSelectedLineId(val);
                  syncAmountToLine(val);
                }}
              >
                <option value="">Välj rad</option>
                {lineOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* STEG 1 — detaljer */}
      {step === 1 && (
        <div className="space-y-4">
          <div style={adminModalSectionStyle}>
            <label className={ADMIN_MODAL_LABEL_CLS}>Anledning</label>
            <select
              className={ADMIN_MODAL_INPUT_CLS}
              value={reason}
              onChange={(e) => setReason(e.target.value || 'order_change')}
            >
              {Object.entries(REASON_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div style={adminModalSectionStyle}>
            <label className={ADMIN_MODAL_LABEL_CLS}>
              {mode === 'cancel_subscription'
                ? 'Kreditbelopp vid avslut (kr)'
                : 'Kreditbelopp (kr)'}
            </label>
            <input
              type="number"
              className={ADMIN_MODAL_INPUT_CLS}
              min={1}
              step={1}
              value={amountKr}
              onChange={(e) => setAmountKr(e.target.value)}
            />
            {mode !== 'cancel_subscription' && (
              <span style={fieldHintStyle}>Max {fmtKr(maxCreditOre)}</span>
            )}
            {amountOre > maxCreditOre && mode !== 'cancel_subscription' && (
              <span style={fieldErrorStyle}>Beloppet överstiger valt underlag</span>
            )}
          </div>

          {isPaidInvoice && (
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend className={ADMIN_MODAL_LABEL_CLS} style={{ marginBottom: 6 }}>
                Hur ska krediten hanteras?
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {canRefundPaymentMethod && (
                  <label style={radioLabelStyle}>
                    <input
                      type="radio"
                      name="wizard-settlement"
                      value="refund"
                      checked={resolvedSettlementMode === 'refund'}
                      onChange={() => setSettlementMode('refund')}
                      style={radioInputStyle}
                      className={RADIO_CLS}
                    />
                    {SETTLEMENT_LABEL.refund}
                  </label>
                )}
                <label style={radioLabelStyle}>
                  <input
                    type="radio"
                    name="wizard-settlement"
                    value="customer_balance"
                    checked={resolvedSettlementMode === 'customer_balance'}
                    onChange={() => setSettlementMode('customer_balance')}
                    style={radioInputStyle}
                    className={RADIO_CLS}
                  />
                  {SETTLEMENT_LABEL.customer_balance}
                </label>
                <label style={radioLabelStyle}>
                  <input
                    type="radio"
                    name="wizard-settlement"
                    value="outside_stripe"
                    checked={resolvedSettlementMode === 'outside_stripe'}
                    onChange={() => setSettlementMode('outside_stripe')}
                    style={radioInputStyle}
                    className={RADIO_CLS}
                  />
                  {SETTLEMENT_LABEL.outside_stripe}
                </label>
              </div>
            </fieldset>
          )}

          {mode === 'credit_and_reissue' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                borderRadius: 8,
                border: '1px solid rgba(74,47,24,0.12)',
                background: 'rgba(74,47,24,0.03)',
                padding: 12,
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#9D8E7D',
                  margin: 0,
                }}
              >
                Ny ersättningsfaktura
              </p>
              <div style={adminModalSectionStyle}>
                <label className={ADMIN_MODAL_LABEL_CLS}>Nytt fakturabelopp (kr)</label>
                <input
                  type="number"
                  className={ADMIN_MODAL_INPUT_CLS}
                  min={1}
                  step={1}
                  value={newAmountKr}
                  onChange={(e) => setNewAmountKr(e.target.value)}
                />
              </div>
              <div style={adminModalSectionStyle}>
                <label className={ADMIN_MODAL_LABEL_CLS}>Beskrivning</label>
                <input
                  type="text"
                  className={ADMIN_MODAL_INPUT_CLS}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Korrigerat månadsbelopp"
                  maxLength={500}
                />
              </div>
            </div>
          )}

          <div style={adminModalSectionStyle}>
            <label className={ADMIN_MODAL_LABEL_CLS}>Intern notering</label>
            <textarea
              className={ADMIN_MODAL_INPUT_CLS}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              maxLength={2000}
              style={{ resize: 'vertical' }}
            />
          </div>

          {mode === 'cancel_subscription' ? (
            <div style={adminModalAlertStyle('warning')}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Detta avslutar kundens aktiva abonnemang direkt.</span>
            </div>
          ) : isOpenInvoice ? (
            <div style={adminModalAlertStyle('info')}>
              <span>
                På en öppen faktura minskar kreditnotan kvarvarande belopp. Blir totalen 0
                markeras fakturan som betald.
              </span>
            </div>
          ) : (
            <div style={adminModalAlertStyle('warning')}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                På en betald faktura måste krediten landa som refund, kundsaldo eller
                reglering utanför Stripe.
              </span>
            </div>
          )}
        </div>
      )}

      {/* STEG 2 — granska */}
      {step === 2 && (
        <div className="space-y-4">
          <div
            style={{
              borderRadius: 8,
              border: '1px solid rgba(74,47,24,0.12)',
              background: '#FAF8F5',
              padding: 16,
            }}
          >
            <h3
              style={{
                marginBottom: 12,
                fontSize: 13,
                fontWeight: 600,
                color: '#4A2F18',
              }}
            >
              Sammanfattning
            </h3>
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px 0',
                fontSize: 13,
              }}
            >
              <dt style={{ color: '#9D8E7D' }}>Åtgärd</dt>
              <dd style={{ fontWeight: 500, color: '#4A2F18' }}>
                {modeOptions.find((m) => m.value === mode)?.label}
              </dd>

              {mode !== 'cancel_subscription' && (
                <>
                  <dt style={{ color: '#9D8E7D' }}>Omfattning</dt>
                  <dd style={{ fontWeight: 500, color: '#4A2F18' }}>
                    {scope === 'invoice'
                      ? 'Hela fakturan'
                      : selectedLine?.description ?? '—'}
                  </dd>
                </>
              )}

              <dt style={{ color: '#9D8E7D' }}>Anledning</dt>
              <dd style={{ fontWeight: 500, color: '#4A2F18' }}>
                {REASON_LABEL[reason] ?? reason}
              </dd>

              <dt style={{ color: '#9D8E7D' }}>Kreditbelopp</dt>
              <dd style={{ fontWeight: 600, color: '#C53030', fontVariantNumeric: 'tabular-nums' }}>
                −{fmtKr(amountOre)}
              </dd>

              {isPaidInvoice && (
                <>
                  <dt style={{ color: '#9D8E7D' }}>Avstämning</dt>
                  <dd style={{ fontWeight: 500, color: '#4A2F18' }}>
                    {SETTLEMENT_LABEL[resolvedSettlementMode]}
                  </dd>
                </>
              )}

              {mode === 'credit_and_reissue' && (
                <>
                  <dt style={{ color: '#9D8E7D' }}>Ny faktura</dt>
                  <dd style={{ fontWeight: 600, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>
                    +{fmtKr(newAmountOre)}
                  </dd>
                  <dt style={{ color: '#9D8E7D' }}>Beskrivning</dt>
                  <dd style={{ fontWeight: 500, color: '#4A2F18' }}>
                    {newDescription || '—'}
                  </dd>
                </>
              )}

              {memo && (
                <>
                  <dt style={{ color: '#9D8E7D' }}>Notering</dt>
                  <dd style={{ color: '#4A2F18' }}>{memo}</dd>
                </>
              )}
            </dl>
          </div>

          {mode === 'credit_and_reissue' && (
            <div
              style={{
                borderRadius: 8,
                border: '1px solid rgba(74,47,24,0.12)',
                background: 'rgba(74,47,24,0.03)',
                padding: 12,
                fontSize: 12,
                color: '#9D8E7D',
              }}
            >
              <p style={{ marginBottom: 4, fontWeight: 500, color: '#4A2F18' }}>
                Nettoeffekt:
              </p>
              <p>
                −{fmtKr(amountOre)} (kreditnota) +{' '}
                {fmtKr(newAmountOre)} (ny faktura) ={' '}
                <span style={{ fontWeight: 600, color: '#4A2F18' }}>
                  {newAmountOre - amountOre >= 0 ? '+' : ''}
                  {fmtKr(newAmountOre - amountOre)}
                </span>{' '}
                till kund
              </p>
            </div>
          )}

          <div style={adminModalAlertStyle('info')}>
            <span>
              Klicka <em>Bekräfta</em> för att utföra åtgärden i Stripe. Det går inte att
              ångra automatiskt — en ny kredit eller faktura krävs för att rätta misstag.
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(74,47,24,0.12)',
          paddingTop: 12,
        }}
      >
        <button
          type="button"
          style={{
            ...adminModalSecondaryButtonStyle,
            opacity: step === 0 || submitting ? 0.5 : 1,
          }}
          disabled={step === 0 || submitting}
          onClick={() => setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Tillbaka
        </button>

        {step < 2 ? (
          <button
            type="button"
            style={adminModalPrimaryButtonStyle(
              !((step === 0 && !step0Valid) || (step === 1 && !step1Valid)),
            )}
            disabled={(step === 0 && !step0Valid) || (step === 1 && !step1Valid)}
            onClick={() => setStep((s) => Math.min(2, s + 1) as 0 | 1 | 2)}
          >
            Nästa
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            style={adminModalPrimaryButtonStyle(
              !submitting,
              mode === 'cancel_subscription' ? 'danger' : 'default',
            )}
            disabled={submitting}
            onClick={submit}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === 'cancel_subscription'
              ? 'Bekräfta avslut + kredit'
              : mode === 'credit_and_reissue'
                ? 'Bekräfta kredit + ny faktura'
                : 'Bekräfta kreditnota'}
          </button>
        )}
      </div>
    </div>
  );
}
