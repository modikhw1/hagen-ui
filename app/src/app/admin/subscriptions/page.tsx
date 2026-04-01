'use client';

import { useState, useEffect } from 'react';
import { LeTrendColors, LeTrendRadius, LeTrendTypography } from '@/styles/letrend-design-system';
import { fetchAndCacheClient, readClientCache } from '@/lib/client-cache';
import { supabase } from '@/lib/supabase/client';

interface Subscription {
  id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  customer_profile_id: string | null;
  status: string;
  amount: number;
  interval: string | null;
  interval_count: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created: string;
  customer_name?: string;
}

const ADMIN_SUBSCRIPTIONS_CACHE_KEY = 'admin:subscriptions:v2';
const ADMIN_SUBSCRIPTIONS_CACHE_TTL_MS = 2 * 60_000;
const ADMIN_SUBSCRIPTIONS_CACHE_MAX_STALE_MS = 10 * 60_000;

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
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
      setSyncResult(`Synkat ${data.synced} abonnemang från Stripe (${data.mode})`);
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
            supabase.from('customer_profiles').select('id, business_name, stripe_customer_id'),
          ]);

          if (subsErr) throw new Error(subsErr.message);

          // Build lookup maps: by profile id AND by stripe_customer_id
          const byProfileId = new Map<string, string>();
          const byStripeCustomerId = new Map<string, string>();
          for (const c of customers ?? []) {
            if (c.id && c.business_name) byProfileId.set(c.id, c.business_name);
            if (c.stripe_customer_id && c.business_name) byStripeCustomerId.set(c.stripe_customer_id, c.business_name);
          }

          return (subs || []).map(s => ({
            ...s,
            customer_name:
              (s.customer_profile_id && byProfileId.get(s.customer_profile_id)) ||
              byStripeCustomerId.get(s.stripe_customer_id) ||
              s.stripe_customer_id?.slice(0, 18) ||
              'Okänd',
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

  const formatAmount = (amountOre: number, interval?: string | null, intervalCount?: number) => {
    const kr = amountOre / 100;
    const formatted = kr.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const suffix = interval === 'year' ? '/år'
      : intervalCount === 3 ? '/kvartal'
      : '/mån';
    return `${formatted} kr${suffix}`;
  };

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

  // MRR: normalize to monthly amount
  const toMonthly = (s: Subscription) => {
    const amount = s.amount || 0;
    if (s.interval === 'year') return amount / 12;
    if (s.interval_count === 3) return amount / 3;
    return amount;
  };
  const activeCount = subscriptions.filter(s => s.status === 'active' && !s.cancel_at_period_end).length;
  const mrr = subscriptions
    .filter(s => s.status === 'active')
    .reduce((sum, s) => sum + toMonthly(s), 0);
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
            {(mrr / 100).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 })}
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
            { key: 'all', label: 'Alla' },
            { key: 'active', label: 'Aktiva' },
            { key: 'expiring', label: 'Avslutas' },
            { key: 'trialing', label: 'Prov' },
            { key: 'canceled', label: 'Avslutade' },
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
          <div>Pris</div>
          <div>Startad</div>
          <div>Nästa period</div>
          <div>Status</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
            {subscriptions.length === 0
              ? 'Inga abonnemang hittades. Tryck "Synka från Stripe" för att hämta.'
              : 'Inga abonnemang matchar filtret'}
          </div>
        ) : (
          filtered.map((sub, i) => {
            const daysLeft = getDaysUntilExpiry(sub.current_period_end);
            const sc = sub.cancel_at_period_end
              ? { bg: '#fef3c7', text: '#92400e', label: 'Avslutas' }
              : sub.status === 'active'
                ? { bg: '#d1fae5', text: '#065f46', label: 'Aktiv' }
                : sub.status === 'trialing'
                  ? { bg: '#dbeafe', text: '#1e40af', label: 'Prov' }
                  : sub.status === 'canceled'
                    ? { bg: '#f3f4f6', text: '#6b7280', label: 'Avslutad' }
                    : sub.status === 'past_due'
                      ? { bg: '#fef2f2', text: '#dc2626', label: 'Förfallen' }
                      : { bg: '#f3f4f6', text: '#6b7280', label: sub.status };

            return (
              <a
                key={sub.id}
                href={`https://dashboard.stripe.com/subscriptions/${sub.stripe_subscription_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 100px',
                  gap: '16px',
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
                  <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: '15px' }}>{sub.customer_name}</div>
                  {daysLeft !== null && daysLeft <= 7 && sub.status === 'active' && (
                    <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '2px' }}>
                      {daysLeft <= 0 ? 'Upphörde idag' : `${daysLeft} dagar kvar`}
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: 600, color: '#1a1a2e' }}>
                  {formatAmount(sub.amount, sub.interval, sub.interval_count)}
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>{formatDate(sub.created)}</div>
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
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
