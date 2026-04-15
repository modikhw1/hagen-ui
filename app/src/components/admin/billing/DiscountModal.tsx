'use client';

import { useEffect, useState } from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';

interface DiscountModalProps {
  open: boolean;
  customerId: string | null;
  customerName: string;
  onClose: () => void;
  onApplied: (profile: Record<string, unknown>) => void;
}

export default function DiscountModal(props: DiscountModalProps) {
  const { open, customerId, customerName, onClose, onApplied } = props;
  const [type, setType] = useState<'percent' | 'amount' | 'free_period'>('percent');
  const [value, setValue] = useState(0);
  const [durationMonths, setDurationMonths] = useState(3);
  const [ongoing, setOngoing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType('percent');
    setValue(0);
    setDurationMonths(3);
    setOngoing(false);
    setError(null);
  }, [open]);

  if (!open || !customerId) {
    return null;
  }

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/customers/${customerId}/discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type,
          value: type === 'free_period' ? 100 : value,
          duration_months: ongoing ? null : durationMonths,
          ongoing,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte lägga till rabatt');
      }

      onApplied(payload.profile);
      onClose();
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : 'Kunde inte lägga till rabatt');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '520px', maxWidth: '100%', background: '#fff', borderRadius: '18px', boxShadow: '0 24px 50px rgba(15, 23, 42, 0.18)' }}>
        <div style={{ padding: '24px', borderBottom: `1px solid ${LeTrendColors.border}` }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: LeTrendColors.textMuted, marginBottom: '8px' }}>
            Rabatt
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: LeTrendColors.brownDark }}>
            Lägg till rabatt för {customerName}
          </div>
        </div>

        <div style={{ padding: '24px', display: 'grid', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: LeTrendColors.textSecondary }}>Typ</label>
            <select value={type} onChange={(event) => setType(event.target.value as typeof type)} style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff' }}>
              <option value="percent">Procent</option>
              <option value="amount">Fast belopp</option>
              <option value="free_period">Gratis period</option>
            </select>
          </div>

          {type !== 'free_period' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: LeTrendColors.textSecondary }}>
                Värde {type === 'percent' ? '(%)' : '(kr)'}
              </label>
              <input type="number" min={0} value={value} onChange={(event) => setValue(Math.max(0, Number(event.target.value) || 0))} style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, boxSizing: 'border-box' }} />
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: LeTrendColors.textPrimary }}>
            <input type="checkbox" checked={ongoing} onChange={(event) => setOngoing(event.target.checked)} />
            Rabatt tills vidare
          </label>

          {!ongoing && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: LeTrendColors.textSecondary }}>Varaktighet (månader)</label>
              <input type="number" min={1} max={36} value={durationMonths} onChange={(event) => setDurationMonths(Math.max(1, Math.min(36, Number(event.target.value) || 1)))} style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, boxSizing: 'border-box' }} />
            </div>
          )}

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
          <button onClick={() => void handleSubmit()} disabled={loading} style={{ padding: '12px 16px', borderRadius: LeTrendRadius.md, border: 'none', background: LeTrendColors.brownDark, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Sparar...' : 'Spara rabatt'}
          </button>
        </div>
      </div>
    </div>
  );
}
