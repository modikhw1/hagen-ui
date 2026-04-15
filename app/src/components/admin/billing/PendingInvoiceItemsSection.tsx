'use client';

import { useCallback, useEffect, useState } from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';

interface PendingInvoiceItemsSectionProps {
  customerId: string;
}

interface PendingInvoiceItem {
  id: string;
  description: string;
  amount_ore: number;
  amount_sek: number;
  currency: string;
  created: string | null;
}

export default function PendingInvoiceItemsSection(props: PendingInvoiceItemsSectionProps) {
  const { customerId } = props;
  const [items, setItems] = useState<PendingInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/customers/${customerId}/invoice-items`, {
        credentials: 'include',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte ladda fakturatillägg');
      }
      setItems(payload.items || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/customers/${customerId}/invoice-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ description, amount, currency: 'sek' }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte skapa fakturatillägg');
      }
      setDescription('');
      setAmount(0);
      setShowForm(false);
      await load();
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    setDeletingId(itemId);
    try {
      const response = await fetch(`/api/admin/customers/${customerId}/invoice-items/${itemId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Kunde inte ta bort fakturatillägg');
      }
      await load();
    } catch (error) {
      console.error(error);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: LeTrendColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
        Kommande fakturatillägg
      </div>
      <div style={{ background: LeTrendColors.surface, borderRadius: LeTrendRadius.md, padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', color: LeTrendColors.textMuted }}>
            Dessa poster läggs till på kundens nästa faktura.
          </div>
          <button onClick={() => setShowForm((current) => !current)} style={{ padding: '8px 12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
            {showForm ? 'Stäng' : 'Lägg till rad'}
          </button>
        </div>

        {showForm && (
          <div style={{ display: 'grid', gap: '10px', marginBottom: '14px', padding: '12px', borderRadius: LeTrendRadius.md, background: '#fff', border: `1px solid ${LeTrendColors.border}` }}>
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Beskrivning" style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, boxSizing: 'border-box' }} />
            <input type="number" min={0} value={amount} onChange={(event) => setAmount(Math.max(0, Number(event.target.value) || 0))} placeholder="Belopp (kr)" style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => void handleCreate()} disabled={submitting || !description.trim() || amount <= 0} style={{ padding: '10px 14px', borderRadius: LeTrendRadius.md, border: 'none', background: LeTrendColors.brownDark, color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer' }}>
                {submitting ? 'Sparar...' : 'Spara rad'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: '13px', color: LeTrendColors.textMuted }}>Laddar...</div>
        ) : items.length === 0 ? (
          <div style={{ fontSize: '13px', color: LeTrendColors.textMuted }}>Inga pending invoice items.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {items.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', padding: '12px', borderRadius: LeTrendRadius.md, background: '#fff', border: `1px solid ${LeTrendColors.border}` }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: LeTrendColors.textPrimary }}>{item.description}</div>
                  <div style={{ fontSize: '12px', color: LeTrendColors.textMuted }}>
                    {(item.amount_ore / 100).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 })}
                  </div>
                </div>
                <button onClick={() => void handleDelete(item.id)} disabled={deletingId === item.id} style={{ padding: '8px 10px', borderRadius: LeTrendRadius.md, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: deletingId === item.id ? 'not-allowed' : 'pointer' }}>
                  {deletingId === item.id ? 'Tar bort...' : 'Ta bort'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
