'use client';

import { useMemo, useState } from 'react';
import { LeTrendColors, LeTrendRadius, LeTrendTypography } from '@/styles/letrend-design-system';
import { calculateFirstInvoice } from '@/lib/billing/first-invoice';

export interface InviteWizardValues {
  business_name: string;
  customer_contact_name: string;
  contact_email: string;
  account_manager: string;
  pricing_status: 'fixed' | 'unknown';
  monthly_price: number;
  subscription_interval: 'month' | 'quarter' | 'year';
  contract_start_date: string;
  billing_day_of_month: number;
  waive_days_until_billing: boolean;
}

interface TeamMemberOption {
  id: string;
  name: string;
  email?: string;
}

interface InviteCustomerWizardProps {
  open: boolean;
  loading: boolean;
  teamMembers: TeamMemberOption[];
  onClose: () => void;
  onSubmit: (values: InviteWizardValues) => Promise<void> | void;
}

const todayYmd = () => new Date().toISOString().split('T')[0];

function buildDefaultValues(): InviteWizardValues {
  return {
    business_name: '',
    customer_contact_name: '',
    contact_email: '',
    account_manager: '',
    pricing_status: 'fixed',
    monthly_price: 0,
    subscription_interval: 'month',
    contract_start_date: todayYmd(),
    billing_day_of_month: 25,
    waive_days_until_billing: false,
  };
}

export default function InviteCustomerWizard(props: InviteCustomerWizardProps) {
  if (!props.open) {
    return null;
  }

  return <InviteCustomerWizardDialog {...props} />;
}

function InviteCustomerWizardDialog(props: InviteCustomerWizardProps) {
  const { loading, teamMembers, onClose, onSubmit } = props;
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<InviteWizardValues>(() => buildDefaultValues());

  const preview = useMemo(() => calculateFirstInvoice({
    pricingStatus: values.pricing_status,
    recurringPriceSek: values.monthly_price,
    startDate: values.contract_start_date,
    billingDay: values.billing_day_of_month,
    waiveDaysUntilBilling: values.waive_days_until_billing,
  }), [values]);

  const canProceedStep1 = Boolean(values.business_name.trim() && values.contact_email.trim());
  const canProceedStep2 = values.pricing_status === 'unknown' || values.monthly_price > 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '720px', maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: '20px', boxShadow: '0 32px 60px rgba(15, 23, 42, 0.24)' }}>
        <div style={{ padding: '28px 28px 20px', borderBottom: `1px solid ${LeTrendColors.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', color: LeTrendColors.textMuted, marginBottom: '8px' }}>
                Kundinbjudan
              </div>
              <h2 style={{ margin: 0, fontSize: '26px', fontWeight: 700, fontFamily: LeTrendTypography.fontFamily.heading, color: LeTrendColors.brownDark }}>
                Skapa kund i tre steg
              </h2>
            </div>
            <button onClick={onClose} disabled={loading} style={{ border: 'none', background: 'transparent', fontSize: '28px', lineHeight: 1, cursor: loading ? 'not-allowed' : 'pointer', color: LeTrendColors.textMuted }}>
              ×
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '20px' }}>
            {[
              { id: 1, label: 'Kundinformation' },
              { id: 2, label: 'Prismodell' },
              { id: 3, label: 'Fakturering & start' },
            ].map((item) => {
              const active = step === item.id;
              const completed = step > item.id;
              return (
                <div key={item.id} style={{ padding: '12px 14px', borderRadius: '14px', border: `1px solid ${active ? LeTrendColors.brownDark : LeTrendColors.border}`, background: active ? 'rgba(107,68,35,0.07)' : completed ? 'rgba(16,185,129,0.1)' : '#fff' }}>
                  <div style={{ fontSize: '11px', color: active ? LeTrendColors.brownDark : LeTrendColors.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Steg {item.id}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: active ? LeTrendColors.brownDark : LeTrendColors.textPrimary }}>
                    {item.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '28px', display: 'grid', gap: '18px' }}>
          {step === 1 && (
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: LeTrendColors.textSecondary }}>Företagsnamn</label>
                <input value={values.business_name} onChange={(event) => setValues((current) => ({ ...current, business_name: event.target.value }))} placeholder="Café Månsson" style={{ width: '100%', padding: '14px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: LeTrendColors.textSecondary }}>Kontaktperson</label>
                  <input value={values.customer_contact_name} onChange={(event) => setValues((current) => ({ ...current, customer_contact_name: event.target.value }))} placeholder="Namn" style={{ width: '100%', padding: '14px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: LeTrendColors.textSecondary }}>E-post</label>
                  <input type="email" value={values.contact_email} onChange={(event) => setValues((current) => ({ ...current, contact_email: event.target.value }))} placeholder="kontakt@foretag.se" style={{ width: '100%', padding: '14px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: LeTrendColors.textSecondary }}>Account Manager</label>
                <select value={values.account_manager} onChange={(event) => setValues((current) => ({ ...current, account_manager: event.target.value }))} style={{ width: '100%', padding: '14px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', background: '#fff' }}>
                  <option value="">Välj...</option>
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.email || member.name}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <button onClick={() => setValues((current) => ({ ...current, pricing_status: 'fixed' }))} style={{ textAlign: 'left', padding: '18px', borderRadius: '16px', border: `1px solid ${values.pricing_status === 'fixed' ? LeTrendColors.brownDark : LeTrendColors.border}`, background: values.pricing_status === 'fixed' ? 'rgba(107,68,35,0.07)' : '#fff', cursor: 'pointer' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: LeTrendColors.textPrimary, marginBottom: '4px' }}>Fast pris</div>
                  <div style={{ fontSize: '13px', color: LeTrendColors.textMuted }}>Sätt återkommande debitering direkt.</div>
                </button>
                <button onClick={() => setValues((current) => ({ ...current, pricing_status: 'unknown', monthly_price: 0 }))} style={{ textAlign: 'left', padding: '18px', borderRadius: '16px', border: `1px solid ${values.pricing_status === 'unknown' ? LeTrendColors.brownDark : LeTrendColors.border}`, background: values.pricing_status === 'unknown' ? 'rgba(107,68,35,0.07)' : '#fff', cursor: 'pointer' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: LeTrendColors.textPrimary, marginBottom: '4px' }}>Ej satt ännu</div>
                  <div style={{ fontSize: '13px', color: LeTrendColors.textMuted }}>Skapa kunden nu och sätt pris senare.</div>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: LeTrendColors.textSecondary }}>Pris (SEK)</label>
                  <input type="number" min={0} value={values.monthly_price} disabled={values.pricing_status === 'unknown'} onChange={(event) => setValues((current) => ({ ...current, monthly_price: Math.max(0, Number(event.target.value) || 0) }))} style={{ width: '100%', padding: '14px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', boxSizing: 'border-box', opacity: values.pricing_status === 'unknown' ? 0.55 : 1 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: LeTrendColors.textSecondary }}>Faktureringsintervall</label>
                  <select value={values.subscription_interval} onChange={(event) => setValues((current) => ({ ...current, subscription_interval: event.target.value as InviteWizardValues['subscription_interval'] }))} style={{ width: '100%', padding: '14px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', background: '#fff' }}>
                    <option value="month">Månad</option>
                    <option value="quarter">Kvartal</option>
                    <option value="year">År</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: LeTrendColors.textSecondary }}>Startdatum</label>
                  <input type="date" value={values.contract_start_date} onChange={(event) => setValues((current) => ({ ...current, contract_start_date: event.target.value }))} style={{ width: '100%', padding: '14px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: LeTrendColors.textSecondary }}>Faktureringsdag</label>
                  <input type="number" min={1} max={28} value={values.billing_day_of_month} onChange={(event) => setValues((current) => ({ ...current, billing_day_of_month: Math.max(1, Math.min(28, Number(event.target.value) || 25)) }))} style={{ width: '100%', padding: '14px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', boxSizing: 'border-box' }} />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px', borderRadius: '16px', border: `1px solid ${LeTrendColors.border}`, background: '#fff7ed', cursor: 'pointer' }}>
                <input type="checkbox" checked={values.waive_days_until_billing} onChange={(event) => setValues((current) => ({ ...current, waive_days_until_billing: event.target.checked }))} style={{ marginTop: '3px' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: LeTrendColors.textPrimary, marginBottom: '4px' }}>
                    Bjud på dagarna fram till nästa faktureringsdag
                  </div>
                  <div style={{ fontSize: '13px', color: LeTrendColors.textMuted }}>
                    Om det här är påslaget skapas ingen första deldebitering före nästa ordinarie faktureringsdag.
                  </div>
                </div>
              </label>

              <div style={{ padding: '18px', borderRadius: '18px', background: LeTrendColors.surface, border: `1px solid ${LeTrendColors.border}` }}>
                <div style={{ fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', color: LeTrendColors.textMuted, marginBottom: '10px' }}>
                  Förhandsvisning
                </div>
                <div style={{ fontSize: '14px', color: LeTrendColors.textSecondary, marginBottom: '6px' }}>
                  {preview.explanation}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: LeTrendColors.brownDark }}>
                  {preview.amountSek !== null ? `Första faktura: ${preview.amountSek.toLocaleString()} kr` : 'Första faktura beräknas när pris är satt'}
                </div>
                {preview.nextBillingDate && (
                  <div style={{ fontSize: '13px', color: LeTrendColors.textMuted, marginTop: '6px' }}>
                    Nästa ordinarie faktureringsdag: {preview.nextBillingDate}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '20px 28px 28px', borderTop: `1px solid ${LeTrendColors.border}`, display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            {step > 1 && (
              <button onClick={() => setStep((current) => current - 1)} disabled={loading} style={{ padding: '12px 18px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}>
                Tillbaka
              </button>
            )}
            <button onClick={onClose} disabled={loading} style={{ padding: '12px 18px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}>
              Avbryt
            </button>
          </div>

          {step < 3 ? (
            <button onClick={() => setStep((current) => current + 1)} disabled={(step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2) || loading} style={{ padding: '12px 20px', borderRadius: LeTrendRadius.md, border: 'none', background: LeTrendColors.brownDark, color: '#fff', cursor: (step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2) || loading ? 'not-allowed' : 'pointer', opacity: (step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2) || loading ? 0.55 : 1, fontWeight: 600 }}>
              Nästa
            </button>
          ) : (
            <button onClick={() => void onSubmit(values)} disabled={loading || !canProceedStep1 || !canProceedStep2} style={{ padding: '12px 20px', borderRadius: LeTrendRadius.md, border: 'none', background: LeTrendColors.brownDark, color: '#fff', cursor: loading || !canProceedStep1 || !canProceedStep2 ? 'not-allowed' : 'pointer', opacity: loading || !canProceedStep1 || !canProceedStep2 ? 0.55 : 1, fontWeight: 600 }}>
              {loading ? 'Skickar...' : 'Skicka inbjudan'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
