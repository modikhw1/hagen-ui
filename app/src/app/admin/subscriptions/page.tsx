'use client';

import { useState, useEffect } from 'react';
import { LeTrendColors, LeTrendRadius, LeTrendTypography } from '@/styles/letrend-design-system';
import { fetchAndCacheClient, readClientCache } from '@/lib/client-cache';
import { supabase } from '@/lib/supabase/client';

interface Subscription {
  id: string;
  stripe_subscription_id: string;
  customer_profile_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  customer_name?: string;
  monthly_price?: number;
}

const ADMIN_SUBSCRIPTIONS_CACHE_KEY = 'admin:subscriptions:v1';
const ADMIN_SUBSCRIPTIONS_CACHE_TTL_MS = 2 * 60_000;
const ADMIN_SUBSCRIPTIONS_CACHE_MAX_STALE_MS = 10 * 60_000;

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const syncFromStripe = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/studio/stripe/sync-subscriptions', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSyncResult(`Synkat ${data.synced} abonnemang från Stripe`);
      void fetchSubscriptions(true);
    } catch (err: unknown) {
      setSyncResult(err instanceof Error ? err.message : 'Kunde inte synka');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const cached = readClientCache<Subscription[]>(ADMIN_SUBSCRIPTIONS_CACHE_KEY, {
      allowExpired: true,
      maxStaleMs: ADMIN_SUBSCRIPTIONS_CACHE_MAX_STALE_MS,
    });

    if (cached) {
      setSubscriptions(cached.value);
      setLoading(false);
      void fetchSubscriptions(true);
      return;
    }

    void fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async (force = false) => {
    try {
      setError(null);
      const nextSubs = await fetchAndCacheClient<Subscription[]>(
        ADMIN_SUBSCRIPTIONS_CACHE_KEY,
        async () => {
          const [{ data: subs, error: subsErr }, { data: customers }] = await Promise.all([
            supabase.from('subscriptions').select('*').order('created', { ascending: false }),
            supabase.from('customer_profiles').select('id, business_name, monthly_price'),
          ]);

          if (subsErr) throw new Error(subsErr.message);

          const customerMap = new Map(customers?.map(c => [c.id, c]) ?? []);
          return (subs || []).map(s => ({
            ...s,
            customer_name: customerMap.get(s.customer_profile_id)?.business_name || 'Okänd',
            monthly_price: customerMap.get(s.customer_profile_id)?.monthly_price || 0,
          }));
        },
        ADMIN_SUBSCRIPTIONS_CACHE_TTL_MS,
        { force }
      );

      setSubscriptions(nextSubs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Kunde inte ladda abonnemang';
      console.error('Error:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

  const getDaysUntilExpiry = (endDate: string | null) => {
    if (!endDate) return null;
    return Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const filtered = subscriptions.filter(s => {
    const matchSearch = !searchQuery || s.customer_name?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'all') return true;
    if (filter === 'active') return s.status === 'active' && !s.cancel_at_period_end;
    if (filter === 'expiring') return s.cancel_at_period_end || (s.status === 'active' && getDaysUntilExpiry(s.current_period_end) !== null && (getDaysUntilExpiry(s.current_period_end) ?? Infinity) <= 14);
    if (filter === 'canceled') return s.status === 'canceled';
    if (filter === 'trialing') return s.status === 'trialing';
    return true;
  });

  const activeCount = subscriptions.filter(s => s.status === 'active' && !s.cancel_at_period_end).length;
  const mrr = subscriptions.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.monthly_price || 0), 0);
  const expiringCount = subscriptions.filter(s => s.cancel_at_period_end).length;

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
          Abonnemang
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
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>MRR</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: LeTrendColors.brownDark }}>
            {mrr.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 })}
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Aktiva</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#10b981' }}>{activeCount}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Avslutas</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>{expiringCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
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
          }}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { key: 'active', label: 'Aktiva' },
            { key: 'expiring', label: 'Avslutas' },
            { key: 'trialing', label: 'Prov' },
            { key: 'canceled', label: 'Avslutade' },
            { key: 'all', label: 'Alla' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '8px 14px',
                borderRadius: LeTrendRadius.md,
                border: 'none',
                background: filter === f.key ? LeTrendColors.brownDark : LeTrendColors.surface,
                color: filter === f.key ? LeTrendColors.cream : LeTrendColors.textSecondary,
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
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
            onClick={() => { setLoading(true); void fetchSubscriptions(true); }}
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
          gridTemplateColumns: '2fr 1fr 1fr 1fr 100px',
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
          <div>Pris/mån</div>
          <div>Periodens start</div>
          <div>Nästa betalning</div>
          <div>Status</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Inga abonnemang</div>
        ) : (
          filtered.map((sub, i) => {
            const daysLeft = getDaysUntilExpiry(sub.current_period_end);
            const sc = sub.cancel_at_period_end
              ? { bg: '#fef3c7', text: '#92400e', label: 'Avslutas' }
              : sub.status === 'active'
                ? { bg: '#d1fae5', text: '#065f46', label: 'Aktiv' }
                : sub.status === 'trialing'
                  ? { bg: '#dbeafe', text: '#1e40af', label: 'Prov' }
                  : { bg: '#f3f4f6', text: '#6b7280', label: sub.status };

            return (
              <div
                key={sub.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 100px',
                  gap: '16px',
                  padding: '16px 20px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: '15px' }}>{sub.customer_name}</div>
                  {daysLeft !== null && daysLeft <= 7 && sub.status === 'active' && (
                    <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '2px' }}>
                      {daysLeft <= 0 ? 'Upphörde idag' : `${daysLeft} dagar kvar`}
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: 600, color: '#1a1a2e' }}>
                  {(sub.monthly_price || 0).toLocaleString('sv-SE')} kr
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>{formatDate(sub.current_period_start)}</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>{formatDate(sub.current_period_end)}</div>
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
