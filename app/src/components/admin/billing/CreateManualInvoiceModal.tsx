'use client';

import { useEffect, useState } from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';

interface CreateManualInvoiceModalProps {
  open: boolean;
  customerId: string | null;
  customerName: string;
  onClose: () => void;
  onCreated: () => void;
}

interface DraftInvoiceItem {
  description: string;
  amount: number;
}

export default function CreateManualInvoiceModal(props: CreateManualInvoiceModalProps) {
  const { open, customerId, customerName, onClose, onCreated } = props;
  const [items, setItems] = useState<DraftInvoiceItem[]>([{ description: '', amount: 0 }]);
  const [daysUntilDue, setDaysUntilDue] = useState(14);
  const [autoFinalize, setAutoFinalize] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setItems([{ description: '', amount: 0 }]);
    setDaysUntilDue(14);
    setAutoFinalize(true);
    setError(null);
  }, [open]);

  if (!open || !customerId) {
    return null;
  }

  const handleCreate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/invoices/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customer_profile_id: customerId,
          items: items.filter((item) => item.description.trim() && item.amount > 0),
          days_until_due: daysUntilDue,
          auto_finalize: autoFinalize,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte skapa faktura');
      }

      onCreated();
      onClose();
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : 'Kunde inte skapa faktura');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '640px', maxWidth: '100%', background: '#fff', borderRadius: '18px', boxShadow: '0 24px 50px rgba(15, 23, 42, 0.18)' }}>
        <div style={{ padding: '24px', borderBottom: `1px solid ${LeTrendColors.border}` }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: LeTrendColors.textMuted, marginBottom: '8px' }}>
            Manuell faktura
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: LeTrendColors.brownDark }}>
            Skapa one-off-faktura för {customerName}
          </div>
        </div>

        <div style={{ padding: '24px', display: 'grid', gap: '14px' }}>
          {items.map((item, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 160px auto', gap: '10px' }}>
              <input value={item.description} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, description: event.target.value } : row))} placeholder="Beskrivning" style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, boxSizing: 'border-box' }} />
              <input type="number" min={0} value={item.amount} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, amount: Math.max(0, Number(event.target.value) || 0) } : row))} placeholder="Belopp (kr)" style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, boxSizing: 'border-box' }} />
              <button onClick={() => setItems((current) => current.length === 1 ? current : current.filter((_, rowIndex) => rowIndex !== index))} style={{ padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: 'pointer' }}>
                Ta bort
              </button>
            </div>
          ))}

          <button onClick={() => setItems((current) => [...current, { description: '', amount: 0 }])} style={{ justifySelf: 'flex-start', padding: '10px 14px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: 'pointer' }}>
            Lägg till rad
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: LeTrendColors.textSecondary }}>Förfaller om (dagar)</label>
              <input type="number" min={1} max={90} value={daysUntilDue} onChange={(event) => setDaysUntilDue(Math.max(1, Math.min(90, Number(event.target.value) || 14)))} style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, boxSizing: 'border-box' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: LeTrendColors.textPrimary }}>
              <input type="checkbox" checked={autoFinalize} onChange={(event) => setAutoFinalize(event.target.checked)} />
              Finalisera direkt
            </label>
          </div>

          {error && (
            <div style={{ padding: '12px', borderRadius: LeTrendRadius.md, background: '#fef2f2', color: '#b91c1c', fontSize: '13px' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '0 24px 24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} disabled={loading} style={{ padding: '12px 16px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}>
            Avbryt
          </button>
          <button onClick={() => void handleCreate()} disabled={loading} style={{ padding: '12px 16px', borderRadius: LeTrendRadius.md, border: 'none', background: LeTrendColors.brownDark, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Skapar...' : 'Skapa faktura'}
          </button>
        </div>
      </div>
    </div>
  );
}
