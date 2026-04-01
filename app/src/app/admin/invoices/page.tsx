'use client';

import { useState, useEffect } from 'react';
import { LeTrendColors, LeTrendRadius, LeTrendTypography } from '@/styles/letrend-design-system';
import { fetchAndCacheClient, readClientCache } from '@/lib/client-cache';
import { supabase } from '@/lib/supabase/client';

interface Invoice {
  id: string;
  stripe_invoice_id: string;
  stripe_customer_id: string;
  customer_profile_id: string | null;
  customer_name?: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
}

const ADMIN_INVOICES_CACHE_KEY = 'admin:invoices:v2';
const ADMIN_INVOICES_CACHE_TTL_MS = 2 * 60_000;
const ADMIN_INVOICES_CACHE_MAX_STALE_MS = 10 * 60_000;

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const syncFromStripe = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/studio/stripe/sync-invoices', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSyncResult(`Synkat ${data.synced} fakturor från Stripe (${data.mode})`);
      void fetchInvoices(true);
    } catch (err: unknown) {
      setSyncResult(err instanceof Error ? err.message : 'Kunde inte synka');
    } finally {
      setSyncing(false);
    }
  };

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

          // Build lookup maps from customer_profiles
          const customerIds = [...new Set(rows.map(i => i.customer_profile_id).filter(Boolean))];
          const stripeCustomerIds = [...new Set(rows.map(i => i.stripe_customer_id).filter(Boolean))];

          const byProfileId = new Map<string, string>();
          const byStripeId = new Map<string, string>();

          if (customerIds.length > 0 || stripeCustomerIds.length > 0) {
            const { data: customers } = await supabase
              .from('customer_profiles')
              .select('id, business_name, stripe_customer_id');
            for (const c of customers ?? []) {
              if (c.id && c.business_name) byProfileId.set(c.id, c.business_name);
              if (c.stripe_customer_id && c.business_name) byStripeId.set(c.stripe_customer_id, c.business_name);
            }
          }

          return rows.map(inv => ({
            ...inv,
            customer_name:
              (inv.customer_profile_id && byProfileId.get(inv.customer_profile_id)) ||
              byStripeId.get(inv.stripe_customer_id) ||
              inv.stripe_customer_id?.slice(0, 18) ||
              'Okänd',
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

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
  const formatAmount = (a: number) =>
    (a / 100).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 });

  // Readable invoice number from stripe_invoice_id (e.g. "in_1THLxx..." -> "#1THLxx")
  const shortInvoiceId = (id: string) => {
    if (!id) return '';
    const short = id.replace(/^in_/, '');
    return `#${short.slice(0, 8)}`;
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'paid': return { bg: '#d1fae5', text: '#065f46', label: 'Betald' };
      case 'open': return { bg: '#fef3c7', text: '#92400e', label: 'Obetald' };
      case 'void': return { bg: '#f3f4f6', text: '#6b7280', label: 'Annullerad' };
      case 'draft': return { bg: '#e0e7ff', text: '#3730a3', label: 'Utkast' };
      case 'uncollectible': return { bg: '#fef2f2', text: '#dc2626', label: 'Ej indrivbar' };
      default: return { bg: '#f3f4f6', text: '#6b7280', label: status };
    }
  };

  const countByStatus = {
    open: invoices.filter(i => i.status === 'open').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    void: invoices.filter(i => i.status === 'void').length,
  };

  // Totals
  const totalUnpaid = invoices
    .filter(i => i.status === 'open')
    .reduce((sum, i) => sum + i.amount_due, 0);
  const totalPaid = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + i.amount_paid, 0);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: LeTrendColors.textMuted }}>
        Laddar...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 700,
          fontFamily: LeTrendTypography.fontFamily.heading,
          color: LeTrendColors.brownDark,
          margin: 0,
        }}>
          Fakturor
        </h1>
        <button
          onClick={syncFromStripe}
          disabled={syncing}
          style={{
            padding: '8px 16px',
            borderRadius: LeTrendRadius.md,
            border: `1px solid ${LeTrendColors.border}`,
            background: '#fff',
            color: LeTrendColors.brownDark,
            fontWeight: 500,
            cursor: syncing ? 'wait' : 'pointer',
            fontSize: '13px',
            opacity: syncing ? 0.6 : 1,
          }}
        >
          {syncing ? 'Synkar...' : 'Synka från Stripe'}
        </button>
      </div>
      {syncResult && (
        <div style={{
          marginBottom: '16px',
          padding: '10px 12px',
          borderRadius: LeTrendRadius.md,
          background: syncResult.startsWith('Synkat') ? '#f0fdf4' : '#fef2f2',
          color: syncResult.startsWith('Synkat') ? '#065f46' : LeTrendColors.error,
          fontSize: '13px',
        }}>
          {syncResult}
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Obetalda</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#92400e' }}>
            {formatAmount(totalUnpaid)}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{countByStatus.open} fakturor</div>
        </div>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Betalda</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#065f46' }}>
            {formatAmount(totalPaid)}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{countByStatus.paid} fakturor</div>
        </div>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Totalt</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: LeTrendColors.brownDark }}>
            {invoices.length}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>fakturor</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { key: 'all', label: 'Alla' },
          { key: 'open', label: 'Obetald' },
          { key: 'paid', label: 'Betald' },
          { key: 'void', label: 'Annullerad' },
          { key: 'draft', label: 'Utkast' },
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
            minWidth: '200px',
            outline: 'none',
            background: '#fff',
            marginLeft: 'auto',
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
          gridTemplateColumns: '2fr 100px 1fr 1fr 1fr 110px',
          gap: '12px',
          padding: '14px 20px',
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          fontSize: '12px',
          fontWeight: 600,
          color: '#6b7280',
          textTransform: 'uppercase',
        }}>
          <div>Kund</div>
          <div>Faktura</div>
          <div>Belopp</div>
          <div>Skapad</div>
          <div>Förfallodatum</div>
          <div>Status</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
            {invoices.length === 0
              ? 'Inga fakturor hittades. Tryck "Synka från Stripe" för att hämta.'
              : 'Inga fakturor matchar filtret'}
          </div>
        ) : (
          filtered.map((inv, i) => {
            const sc = getStatusConfig(inv.status);
            const invoiceUrl = inv.hosted_invoice_url
              || `https://dashboard.stripe.com/invoices/${inv.stripe_invoice_id}`;

            return (
              <a
                key={inv.id}
                href={invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 100px 1fr 1fr 1fr 110px',
                  gap: '12px',
                  padding: '16px 20px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none',
                  alignItems: 'center',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: '15px' }}>{inv.customer_name}</div>
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>
                  {shortInvoiceId(inv.stripe_invoice_id)}
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
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
