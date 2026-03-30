'use client';

import { useState, useEffect } from 'react';
import { LeTrendColors, LeTrendRadius, LeTrendTypography } from '@/styles/letrend-design-system';
import { fetchAndCacheClient, readClientCache } from '@/lib/client-cache';
import { supabase } from '@/lib/supabase/client';

interface Invoice {
  id: string;
  stripe_invoice_id: string;
  customer_profile_id: string;
  customer_name?: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string;
  due_date: string;
  created_at: string;
}

const ADMIN_INVOICES_CACHE_KEY = 'admin:invoices:v1';
const ADMIN_INVOICES_CACHE_TTL_MS = 2 * 60_000;
const ADMIN_INVOICES_CACHE_MAX_STALE_MS = 10 * 60_000;

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const cached = readClientCache<Invoice[]>(ADMIN_INVOICES_CACHE_KEY, {
      allowExpired: true,
      maxStaleMs: ADMIN_INVOICES_CACHE_MAX_STALE_MS,
    });

    if (cached) {
      setInvoices(cached.value);
      setLoading(false);
      void fetchInvoices(true);
      return;
    }

    void fetchInvoices();
  }, []);

  const fetchInvoices = async (force = false) => {
    try {
      setError(null);
      const nextInvoices = await fetchAndCacheClient<Invoice[]>(
        ADMIN_INVOICES_CACHE_KEY,
        async () => {
          const { data, error: supaErr } = await supabase
            .from('invoices')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(300);

          if (supaErr) throw new Error(supaErr.message);

          const rows = data || [];
          const customerIds = [...new Set(rows.map(i => i.customer_profile_id).filter(Boolean))];
          let customerMap = new Map<string, string>();

          if (customerIds.length > 0) {
            const { data: customers } = await supabase
              .from('customer_profiles')
              .select('id, business_name')
              .in('id', customerIds);
            customerMap = new Map(customers?.map(c => [c.id, c.business_name]) ?? []);
          }

          return rows.map(inv => ({
            ...inv,
            customer_name: customerMap.get(inv.customer_profile_id) || 'Okänd',
          }));
        },
        ADMIN_INVOICES_CACHE_TTL_MS,
        { force }
      );

      setInvoices(nextInvoices);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Kunde inte ladda fakturor';
      console.error('Error:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (searchQuery && !inv.customer_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
  const formatAmount = (a: number) =>
    (a / 100).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' });

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'paid': return { bg: '#d1fae5', text: '#065f46', label: 'Betald' };
      case 'open': return { bg: '#fef3c7', text: '#92400e', label: 'Obetald' };
      case 'void': return { bg: '#f3f4f6', text: '#6b7280', label: 'Annullerad' };
      case 'draft': return { bg: '#e0e7ff', text: '#3730a3', label: 'Utkast' };
      default: return { bg: '#f3f4f6', text: '#6b7280', label: status };
    }
  };

  const countByStatus = {
    open: invoices.filter(i => i.status === 'open').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    void: invoices.filter(i => i.status === 'void').length,
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: LeTrendColors.textMuted }}>
        Laddar...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 700,
          fontFamily: LeTrendTypography.fontFamily.heading,
          color: LeTrendColors.brownDark,
          margin: 0,
        }}>
          Fakturor
        </h1>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[
          { key: 'open', label: 'Obetald' },
          { key: 'paid', label: 'Betald' },
          { key: 'void', label: 'Annullerad' },
          { key: 'all', label: 'Alla' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            style={{
              padding: '8px 16px',
              borderRadius: LeTrendRadius.md,
              border: 'none',
              background: statusFilter === f.key ? LeTrendColors.brownDark : LeTrendColors.surface,
              color: statusFilter === f.key ? LeTrendColors.cream : LeTrendColors.textSecondary,
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            {f.label}
            {f.key !== 'all' && countByStatus[f.key as keyof typeof countByStatus] > 0 && (
              <span style={{ marginLeft: '6px', opacity: 0.7 }}>
                ({countByStatus[f.key as keyof typeof countByStatus]})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Sök kund..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            padding: '10px 14px',
            borderRadius: LeTrendRadius.md,
            border: `1px solid ${LeTrendColors.border}`,
            fontSize: '14px',
            minWidth: '250px',
            outline: 'none',
            background: '#fff',
          }}
        />
      </div>

      {error && (
        <div style={{
          marginBottom: '16px',
          padding: '10px 12px',
          borderRadius: LeTrendRadius.md,
          border: `1px solid ${LeTrendColors.error}`,
          background: '#fef2f2',
          color: LeTrendColors.error,
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <span>{error}</span>
          <button
            onClick={() => { setLoading(true); void fetchInvoices(true); }}
            style={{
              padding: '4px 10px',
              borderRadius: LeTrendRadius.sm,
              border: `1px solid ${LeTrendColors.error}`,
              background: 'transparent',
              color: LeTrendColors.error,
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Försök igen
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr 110px',
          gap: '16px',
          padding: '14px 20px',
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          fontSize: '12px',
          fontWeight: 600,
          color: '#6b7280',
          textTransform: 'uppercase',
        }}>
          <div>Kund</div>
          <div>Belopp</div>
          <div>Datum</div>
          <div>Förfallodatum</div>
          <div>Status</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Inga fakturor</div>
        ) : (
          filtered.map((inv, i) => {
            const sc = getStatusConfig(inv.status);
            return (
              <div
                key={inv.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 110px',
                  gap: '16px',
                  padding: '16px 20px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: '15px' }}>{inv.customer_name}</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>{inv.stripe_invoice_id?.slice(0, 20)}...</div>
                </div>
                <div style={{ fontWeight: 600, color: '#1a1a2e' }}>{formatAmount(inv.amount_due)}</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>{formatDate(inv.created_at)}</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>{formatDate(inv.due_date)}</div>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: sc.bg,
                  color: sc.text,
                  width: 'fit-content',
                }}>
                  {sc.label}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
