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
  line_items?: Array<{
    id: string;
    description?: string | null;
    amount?: number | null;
  }>;
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  pageCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface InvoiceListPayload {
  invoices: Invoice[];
  pagination: PaginationState;
  schemaWarnings?: string[];
}

const PAGE_SIZE = 50;
const ADMIN_INVOICES_CACHE_TTL_MS = 2 * 60_000;
const ADMIN_INVOICES_CACHE_MAX_STALE_MS = 10 * 60_000;

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

function getInvoicesCacheKey(page: number, status: string) {
  return `admin:invoices:v3:${status}:${page}`;
}

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pagination, setPagination] = useState<PaginationState>(
    createEmptyPagination(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [schemaWarnings, setSchemaWarnings] = useState<string[]>([]);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(
    null,
  );
  const [currentPage, setCurrentPage] = useState(1);

  const fetchInvoices = useCallback(
    async (options?: { force?: boolean; page?: number }) => {
      const page = options?.page ?? currentPage;
      const force = options?.force ?? false;
      const cacheKey = getInvoicesCacheKey(page, statusFilter);

      try {
        setError(null);
        const nextPayload = await fetchAndCacheClient<InvoiceListPayload>(
          cacheKey,
          async () => {
            const params = new URLSearchParams({
              limit: String(PAGE_SIZE),
              page: String(page),
              includeLineItems: 'true',
            });

            if (statusFilter !== 'all') {
              params.set('status', statusFilter);
            }

            const response = await fetch(
              `/api/admin/invoices?${params.toString()}`,
              {
                credentials: 'include',
              },
            );
            const payload = await response.json();

            if (!response.ok) {
              throw new Error(payload.error || 'Kunde inte ladda fakturor');
            }

            return {
              invoices: payload.invoices || [],
              pagination: payload.pagination || createEmptyPagination(),
            };
          },
          ADMIN_INVOICES_CACHE_TTL_MS,
          { force },
        );

        setInvoices(nextPayload.invoices);
        setPagination(nextPayload.pagination);
        setSchemaWarnings(nextPayload.schemaWarnings || []);
        setExpandedInvoiceId(null);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Kunde inte ladda fakturor';
        console.error('Error:', err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [currentPage, statusFilter],
  );

  useEffect(() => {
    const cacheKey = getInvoicesCacheKey(currentPage, statusFilter);
    const cached = readClientCache<InvoiceListPayload>(cacheKey, {
      allowExpired: true,
      maxStaleMs: ADMIN_INVOICES_CACHE_MAX_STALE_MS,
    });

    if (cached) {
      setInvoices(cached.value.invoices);
      setPagination(cached.value.pagination);
      setLoading(false);
      void fetchInvoices({ force: true, page: currentPage });
      return;
    }

    setLoading(true);
    void fetchInvoices({ page: currentPage });
  }, [currentPage, fetchInvoices, statusFilter]);

  const syncFromStripe = async () => {
    setSyncing(true);
    setSyncResult(null);

    try {
      const response = await fetch('/api/studio/stripe/sync-invoices', {
        method: 'POST',
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Sync failed');
      }

      setSyncResult(`Synkat ${payload.synced} fakturor från Stripe (${payload.mode})`);
      setCurrentPage(1);
      void fetchInvoices({ force: true, page: 1 });
    } catch (err: unknown) {
      setSyncResult(err instanceof Error ? err.message : 'Kunde inte synka');
    } finally {
      setSyncing(false);
    }
  };

  const filtered = invoices.filter((invoice) => {
    if (
      searchQuery &&
      !invoice.customer_name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    return true;
  });

  const formatDate = (value: string | null) =>
    value
      ? new Date(value).toLocaleDateString('sv-SE', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '-';

  const formatAmount = (amount: number) =>
    (amount / 100).toLocaleString('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
    });

  const shortInvoiceId = (id: string) => {
    const short = id.replace(/^in_/, '');
    return `#${short.slice(0, 8)}`;
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'paid':
        return { bg: '#d1fae5', text: '#065f46', label: 'Betald' };
      case 'open':
        return { bg: '#fef3c7', text: '#92400e', label: 'Obetald' };
      case 'void':
        return { bg: '#f3f4f6', text: '#6b7280', label: 'Annullerad' };
      case 'draft':
        return { bg: '#e0e7ff', text: '#3730a3', label: 'Utkast' };
      case 'uncollectible':
        return { bg: '#fef2f2', text: '#dc2626', label: 'Ej indrivbar' };
      default:
        return { bg: '#f3f4f6', text: '#6b7280', label: status };
    }
  };

  const countByStatus = {
    open: invoices.filter((invoice) => invoice.status === 'open').length,
    paid: invoices.filter((invoice) => invoice.status === 'paid').length,
    void: invoices.filter((invoice) => invoice.status === 'void').length,
  };

  const totalUnpaid = invoices
    .filter((invoice) => invoice.status === 'open')
    .reduce((sum, invoice) => sum + invoice.amount_due, 0);
  const totalPaid = invoices
    .filter((invoice) => invoice.status === 'paid')
    .reduce((sum, invoice) => sum + invoice.amount_paid, 0);

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
            Obetalda
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#92400e' }}>
            {formatAmount(totalUnpaid)}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
            {countByStatus.open} fakturor på sidan
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
            Betalda
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#065f46' }}>
            {formatAmount(totalPaid)}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
            {countByStatus.paid} fakturor på sidan
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
            Totalt
          </div>
          <div
            style={{
              fontSize: '28px',
              fontWeight: 700,
              color: LeTrendColors.brownDark,
            }}
          >
            {pagination.total}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
            fakturor i filtret
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {[
          { key: 'all', label: 'Alla' },
          { key: 'open', label: 'Obetald' },
          { key: 'paid', label: 'Betald' },
          { key: 'void', label: 'Annullerad' },
          { key: 'draft', label: 'Utkast' },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => {
              setStatusFilter(item.key);
              setCurrentPage(1);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: LeTrendRadius.md,
              border: 'none',
              background:
                statusFilter === item.key
                  ? LeTrendColors.brownDark
                  : LeTrendColors.surface,
              color:
                statusFilter === item.key
                  ? LeTrendColors.cream
                  : LeTrendColors.textSecondary,
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            {item.label}
            {item.key !== 'all' &&
              countByStatus[item.key as keyof typeof countByStatus] > 0 && (
                <span style={{ marginLeft: '6px', opacity: 0.7 }}>
                  ({countByStatus[item.key as keyof typeof countByStatus]})
                </span>
              )}
          </button>
        ))}

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
            marginLeft: 'auto',
          }}
        />
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
              void fetchInvoices({ force: true, page: currentPage });
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
            gridTemplateColumns: '2fr 100px 1fr 1fr 1fr 160px',
            gap: '12px',
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
          <div>Faktura</div>
          <div>Belopp</div>
          <div>Skapad</div>
          <div>Förfallodatum</div>
          <div>Status / rader</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
            {pagination.total === 0
              ? 'Inga fakturor hittades. Tryck "Synka från Stripe" för att hämta.'
              : 'Inga fakturor matchar sökningen på den här sidan'}
          </div>
        ) : (
          filtered.map((invoice, index) => {
            const statusConfig = getStatusConfig(invoice.status);
            const invoiceUrl =
              invoice.hosted_invoice_url ||
              `https://dashboard.stripe.com/invoices/${invoice.stripe_invoice_id}`;
            const isExpanded = expandedInvoiceId === invoice.id;

            return (
              <div key={invoice.id}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 100px 1fr 1fr 1fr 160px',
                    gap: '12px',
                    padding: '16px 20px',
                    borderBottom:
                      index < filtered.length - 1 || isExpanded
                        ? '1px solid #f3f4f6'
                        : 'none',
                    alignItems: 'center',
                  }}
                >
                  <a
                    href={invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        color: '#1a1a2e',
                        fontSize: '15px',
                      }}
                    >
                      {invoice.customer_name}
                    </div>
                  </a>
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#6b7280',
                      fontFamily: 'monospace',
                    }}
                  >
                    {shortInvoiceId(invoice.stripe_invoice_id)}
                  </div>
                  <div style={{ fontWeight: 600, color: '#1a1a2e' }}>
                    {formatAmount(invoice.amount_due)}
                  </div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>
                    {formatDate(invoice.created_at)}
                  </div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>
                    {formatDate(invoice.due_date)}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      justifyContent: 'space-between',
                    }}
                  >
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
                    <button
                      onClick={() =>
                        setExpandedInvoiceId(isExpanded ? null : invoice.id)
                      }
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: LeTrendColors.brownDark,
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      {isExpanded ? 'Dölj rader' : 'Visa rader'}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 20px 16px', background: '#fcfcfb' }}>
                    {invoice.line_items && invoice.line_items.length > 0 ? (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {invoice.line_items.map((lineItem) => (
                          <div
                            key={lineItem.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '12px',
                              padding: '10px 12px',
                              borderRadius: '10px',
                              background: '#fff',
                              border: '1px solid #ece7e2',
                              fontSize: '13px',
                            }}
                          >
                            <span style={{ color: '#374151' }}>
                              {lineItem.description || 'Rad utan beskrivning'}
                            </span>
                            <strong style={{ color: '#111827' }}>
                              {formatAmount(lineItem.amount || 0)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>
                        Inga sparade fakturarader.
                      </div>
                    )}
                  </div>
                )}
              </div>
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
