'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchAndCacheClient,
  readClientCache,
} from '@/lib/client-cache';
import {
  LeTrendColors,
  LeTrendRadius,
  LeTrendTypography,
} from '@/styles/letrend-design-system';

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

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  pageCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface SubscriptionListPayload {
  subscriptions: Subscription[];
  pagination: PaginationState;
  schemaWarnings?: string[];
}

const PAGE_SIZE = 50;
const ADMIN_SUBSCRIPTIONS_CACHE_TTL_MS = 2 * 60_000;
const ADMIN_SUBSCRIPTIONS_CACHE_MAX_STALE_MS = 10 * 60_000;

function createEmptyPagination(): PaginationState {
  return {
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    pageCount: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

function getSubscriptionsCacheKey(page: number, status: string) {
  return `admin:subscriptions:v3:${status}:${page}`;
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [pagination, setPagination] = useState<PaginationState>(
    createEmptyPagination(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [schemaWarnings, setSchemaWarnings] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchSubscriptions = useCallback(
    async (options?: {
      force?: boolean;
      page?: number;
    }) => {
      const page = options?.page ?? currentPage;
      const force = options?.force ?? false;
      const cacheKey = getSubscriptionsCacheKey(page, filter);

      try {
        setError(null);
        const nextPayload = await fetchAndCacheClient<SubscriptionListPayload>(
          cacheKey,
          async () => {
            const params = new URLSearchParams({
              limit: String(PAGE_SIZE),
              page: String(page),
            });

            if (filter !== 'all') {
              params.set(
                'status',
                filter === 'expiring' ? 'active' : filter,
              );
            }

            const response = await fetch(
              `/api/admin/subscriptions?${params.toString()}`,
              {
                credentials: 'include',
              },
            );
            const payload = await response.json();

            if (!response.ok) {
              throw new Error(payload.error || 'Kunde inte ladda abonnemang');
            }

            return {
              subscriptions: payload.subscriptions || [],
              pagination: payload.pagination || createEmptyPagination(),
            };
          },
          ADMIN_SUBSCRIPTIONS_CACHE_TTL_MS,
          { force },
        );

        setSubscriptions(nextPayload.subscriptions);
        setPagination(nextPayload.pagination);
        setSchemaWarnings(nextPayload.schemaWarnings || []);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Kunde inte ladda abonnemang';
        console.error('Error:', err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [currentPage, filter],
  );

  useEffect(() => {
    const cacheKey = getSubscriptionsCacheKey(currentPage, filter);
    const cached = readClientCache<SubscriptionListPayload>(cacheKey, {
      allowExpired: true,
      maxStaleMs: ADMIN_SUBSCRIPTIONS_CACHE_MAX_STALE_MS,
    });

    if (cached) {
      setSubscriptions(cached.value.subscriptions);
      setPagination(cached.value.pagination);
      setLoading(false);
      void fetchSubscriptions({ force: true, page: currentPage });
      return;
    }

    setLoading(true);
    void fetchSubscriptions({ page: currentPage });
  }, [currentPage, fetchSubscriptions, filter]);

  const syncFromStripe = async () => {
    setSyncing(true);
    setSyncResult(null);

    try {
      const response = await fetch('/api/studio/stripe/sync-subscriptions', {
        method: 'POST',
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Sync failed');
      }

      setSyncResult(
        `Synkat ${payload.synced} abonnemang från Stripe (${payload.mode})`,
      );
      setCurrentPage(1);
      void fetchSubscriptions({ force: true, page: 1 });
    } catch (err: unknown) {
      setSyncResult(err instanceof Error ? err.message : 'Kunde inte synka');
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (value: string | null) =>
    value
      ? new Date(value).toLocaleDateString('sv-SE', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '-';

  const formatAmount = (
    amountOre: number,
    interval?: string | null,
    intervalCount?: number,
  ) => {
    const amountSek = amountOre / 100;
    const formatted = amountSek.toLocaleString('sv-SE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    const suffix =
      interval === 'year'
        ? '/år'
        : intervalCount === 3
          ? '/kvartal'
          : '/mån';
    return `${formatted} kr${suffix}`;
  };

  const getDaysUntilExpiry = (endDate: string | null) => {
    if (!endDate) return null;
    return Math.ceil(
      (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
  };

  const filtered = subscriptions.filter((subscription) => {
    const matchSearch =
      !searchQuery ||
      subscription.customer_name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase());

    if (!matchSearch) {
      return false;
    }

    if (filter === 'expiring') {
      return (
        subscription.cancel_at_period_end ||
        (subscription.status === 'active' &&
          getDaysUntilExpiry(subscription.current_period_end) !== null &&
          (getDaysUntilExpiry(subscription.current_period_end) ?? Infinity) <= 14)
      );
    }

    return true;
  });

  const toMonthly = (subscription: Subscription) => {
    if (subscription.interval === 'year') return subscription.amount / 12;
    if (subscription.interval_count === 3) return subscription.amount / 3;
    return subscription.amount;
  };

  const activeCount = subscriptions.filter(
    (subscription) =>
      subscription.status === 'active' && !subscription.cancel_at_period_end,
  ).length;
  const mrr = subscriptions
    .filter((subscription) => subscription.status === 'active')
    .reduce((sum, subscription) => sum + toMonthly(subscription), 0);
  const expiringCount = subscriptions.filter(
    (subscription) => subscription.cancel_at_period_end,
  ).length;

  if (loading) {
    return (
      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          color: LeTrendColors.textMuted,
        }}
      >
        Laddar...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div
        style={{
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            fontFamily: LeTrendTypography.fontFamily.heading,
            color: LeTrendColors.brownDark,
            margin: 0,
          }}
        >
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
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 12px',
            borderRadius: LeTrendRadius.md,
            background: syncResult.startsWith('Synkat')
              ? '#f0fdf4'
              : '#fef2f2',
            color: syncResult.startsWith('Synkat')
              ? '#065f46'
              : LeTrendColors.error,
            fontSize: '13px',
          }}
        >
          {syncResult}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
            MRR
          </div>
          <div
            style={{
              fontSize: '28px',
              fontWeight: 700,
              color: LeTrendColors.brownDark,
            }}
          >
            {(mrr / 100).toLocaleString('sv-SE', {
              style: 'currency',
              currency: 'SEK',
              minimumFractionDigits: 0,
            })}
          </div>
        </div>
        <div
          style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
            Aktiva
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#10b981' }}>
            {activeCount}
          </div>
        </div>
        <div
          style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
            Avslutas
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>
            {expiringCount}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="Sök kund..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
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
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setFilter(item.key);
                setCurrentPage(1);
              }}
              style={{
                padding: '8px 14px',
                borderRadius: LeTrendRadius.md,
                border: 'none',
                background:
                  filter === item.key
                    ? LeTrendColors.brownDark
                    : LeTrendColors.surface,
                color:
                  filter === item.key
                    ? LeTrendColors.cream
                    : LeTrendColors.textSecondary,
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          style={{
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
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => {
              setLoading(true);
              void fetchSubscriptions({ force: true, page: currentPage });
            }}
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

      {schemaWarnings.length > 0 && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 12px',
            borderRadius: LeTrendRadius.md,
            border: '1px solid #f59e0b',
            background: '#fffbeb',
            color: '#92400e',
            fontSize: '13px',
          }}
        >
          {schemaWarnings.join(' ')}
        </div>
      )}

      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
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
          }}
        >
          <div>Kund</div>
          <div>Pris</div>
          <div>Startad</div>
          <div>Nästa period</div>
          <div>Status</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
            {pagination.total === 0
              ? 'Inga abonnemang hittades. Tryck "Synka från Stripe" för att hämta.'
              : 'Inga abonnemang matchar sökningen på den här sidan'}
          </div>
        ) : (
          filtered.map((subscription, index) => {
            const daysLeft = getDaysUntilExpiry(subscription.current_period_end);
            const statusConfig = subscription.cancel_at_period_end
              ? { bg: '#fef3c7', text: '#92400e', label: 'Avslutas' }
              : subscription.status === 'active'
                ? { bg: '#d1fae5', text: '#065f46', label: 'Aktiv' }
                : subscription.status === 'trialing'
                  ? { bg: '#dbeafe', text: '#1e40af', label: 'Prov' }
                  : subscription.status === 'canceled'
                    ? { bg: '#f3f4f6', text: '#6b7280', label: 'Avslutad' }
                    : subscription.status === 'past_due'
                      ? { bg: '#fef2f2', text: '#dc2626', label: 'Förfallen' }
                      : {
                          bg: '#f3f4f6',
                          text: '#6b7280',
                          label: subscription.status,
                        };

            return (
              <a
                key={subscription.id}
                href={`https://dashboard.stripe.com/subscriptions/${subscription.stripe_subscription_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 100px',
                  gap: '16px',
                  padding: '16px 20px',
                  borderBottom:
                    index < filtered.length - 1 ? '1px solid #f3f4f6' : 'none',
                  alignItems: 'center',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = '#f9fafb';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent';
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: '#1a1a2e',
                      fontSize: '15px',
                    }}
                  >
                    {subscription.customer_name}
                  </div>
                  {daysLeft !== null &&
                    daysLeft <= 7 &&
                    subscription.status === 'active' && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#f59e0b',
                          marginTop: '2px',
                        }}
                      >
                        {daysLeft <= 0 ? 'Upphörde idag' : `${daysLeft} dagar kvar`}
                      </div>
                    )}
                </div>
                <div style={{ fontWeight: 600, color: '#1a1a2e' }}>
                  {formatAmount(
                    subscription.amount,
                    subscription.interval,
                    subscription.interval_count,
                  )}
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {formatDate(subscription.created)}
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {formatDate(subscription.current_period_end)}
                </div>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 500,
                    background: statusConfig.bg,
                    color: statusConfig.text,
                    width: 'fit-content',
                  }}
                >
                  {statusConfig.label}
                </span>
              </a>
            );
          })
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          marginTop: '18px',
        }}
      >
        <div style={{ fontSize: '13px', color: LeTrendColors.textMuted }}>
          Sida {pagination.page} av {pagination.pageCount} · {pagination.total} totalt
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={!pagination.hasPreviousPage}
            style={{
              padding: '8px 12px',
              borderRadius: LeTrendRadius.md,
              border: `1px solid ${LeTrendColors.border}`,
              background: '#fff',
              cursor: pagination.hasPreviousPage ? 'pointer' : 'not-allowed',
              opacity: pagination.hasPreviousPage ? 1 : 0.5,
            }}
          >
            Föregående
          </button>
          <button
            onClick={() => setCurrentPage((page) => page + 1)}
            disabled={!pagination.hasNextPage}
            style={{
              padding: '8px 12px',
              borderRadius: LeTrendRadius.md,
              border: `1px solid ${LeTrendColors.border}`,
              background: '#fff',
              cursor: pagination.hasNextPage ? 'pointer' : 'not-allowed',
              opacity: pagination.hasNextPage ? 1 : 0.5,
            }}
          >
            Nästa
          </button>
        </div>
      </div>
    </div>
  );
}
