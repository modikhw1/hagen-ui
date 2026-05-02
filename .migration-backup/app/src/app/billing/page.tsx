'use client';

import Image from 'next/image';
import { useEffect, useEffectEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

interface Invoice {
  id: string;
  number: string;
  status: string;
  created: number;
  dueDate: string | null;
  amount: number;
  currency: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

export default function BillingPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = useEffectEvent(async (token: string) => {
    try {
      const res = await fetch('/api/stripe/customer-invoices', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      console.log('Billing API response:', data);

      if (data.error && data.error !== 'Not authenticated') {
        setError(data.error);
      } else {
        setInvoices(data.invoices || []);
      }
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setError('Kunde inte hamta fakturor');
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[billing] Auth state:', event, session?.user?.email);
      if (session) {
        void fetchInvoices(session.access_token);
      } else if (event === 'SIGNED_OUT') {
        router.push('/login');
      }
    });

    void supabase.auth.getUser().then(({ data: { user } }) => {
      console.log('[billing] Initial user:', user?.email);
      if (user) {
        // We still need the session for the access_token
        return supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            return fetchInvoices(session.access_token);
          }
        });
      }

      setLoading(false);
      return undefined;
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
    }).format(amount / 100);

  const formatDate = (timestamp: number) =>
    new Date(timestamp * 1000).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return { bg: '#E8F5E9', text: '#2E7D32' };
      case 'open':
        return { bg: '#FFF3E0', text: '#E65100' };
      default:
        return { bg: '#F5F5F5', text: '#757575' };
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#FAF8F5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            border: '3px solid #E8E0D8',
            borderTopColor: '#6B4423',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAF8F5' }}>
      <div
        style={{
          background: 'white',
          borderBottom: '1px solid #E8E0D8',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => router.push('/')}
          style={{
            background: 'none',
            border: 'none',
            color: '#5D4D3D',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ← Tillbaka
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Image
            src="/lt-transparent.png"
            alt="LeTrend"
            width={96}
            height={32}
            style={{ height: '32px', width: 'auto' }}
          />
          <span style={{ fontSize: '18px', fontWeight: '600', color: '#1A1612' }}>
            Fakturering
          </span>
        </div>
        <div style={{ width: '60px' }} />
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        {error ? (
          <div
            style={{
              background: '#FFEBEE',
              color: '#C62828',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '24px',
            }}
          >
            {error}
          </div>
        ) : null}

        {invoices.length === 0 ? (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '48px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
            <h2 style={{ fontSize: '18px', color: '#1A1612', marginBottom: '8px' }}>
              Inga fakturor
            </h2>
            <p style={{ color: '#5D4D3D', fontSize: '14px' }}>Du har inga fakturor annu.</p>
          </div>
        ) : (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 1fr 1fr 80px',
                padding: '14px 20px',
                background: '#FAF8F5',
                borderBottom: '1px solid #E8E0D8',
                fontSize: '12px',
                fontWeight: '600',
                color: '#5D4D3D',
                textTransform: 'uppercase',
              }}
            >
              <div>Faktura</div>
              <div>Datum</div>
              <div>Belopp</div>
              <div>Status</div>
              <div />
            </div>
            {invoices.map((invoice) => {
              const statusStyle = getStatusColor(invoice.status);
              return (
                <div
                  key={invoice.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1fr 1fr 1fr 80px',
                    padding: '16px 20px',
                    borderBottom: '1px solid #F5F0EB',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontWeight: '500', color: '#1A1612' }}>
                    {invoice.number || invoice.id.slice(0, 8)}
                  </div>
                  <div style={{ color: '#5D4D3D' }}>{formatDate(invoice.created)}</div>
                  <div style={{ fontWeight: '500', color: '#1A1612' }}>
                    {formatCurrency(invoice.amount)}
                  </div>
                  <div>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        background: statusStyle.bg,
                        color: statusStyle.text,
                      }}
                    >
                      {invoice.status === 'paid'
                        ? 'Betald'
                        : invoice.status === 'open'
                          ? 'Obetald'
                          : invoice.status}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {invoice.invoicePdf ? (
                      <a
                        href={invoice.invoicePdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 12px',
                          background: '#FAF8F5',
                          border: '1px solid #E5E0DA',
                          borderRadius: '6px',
                          color: '#6B4423',
                          fontSize: '12px',
                          fontWeight: '500',
                          textDecoration: 'none',
                          cursor: 'pointer',
                        }}
                        title="Ladda ner PDF"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        PDF
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p
          style={{
            textAlign: 'center',
            color: '#9A8B7A',
            fontSize: '13px',
            marginTop: '24px',
          }}
        >
          Har du fragor om dina fakturor? Kontakta{' '}
          <a href="mailto:hej@letrend.se" style={{ color: '#6B4423' }}>
            hej@letrend.se
          </a>
        </p>
      </div>
    </div>
  );
}
