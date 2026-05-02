'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface LineItem {
  description: string;
  amount: number;
  currency: string;
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  created: number;
  dueDate: number | null;
  customer: {
    name: string;
    email: string;
  };
  lineItems: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  paid: boolean;
}

export default function InvoicePage() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const invoiceId = typeof params?.id === 'string' ? params.id : '';
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoice = useCallback(async () => {
    try {
      const res = await fetch(`/api/stripe/invoice?id=${invoiceId}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setInvoice(data.invoice);
      }
    } catch (err) {
      console.error('Error fetching invoice:', err);
      setError('Kunde inte hämta fakturan');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    if (!invoiceId) {
      setError('Ogiltigt faktura-id');
      setLoading(false);
      return;
    }

    void fetchInvoice();
  }, [fetchInvoice, invoiceId]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
    }).format(amount / 100);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#FAF8F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid #E8E0D8',
          borderTopColor: '#6B4423',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#FAF8F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}>
        <div style={{
          textAlign: 'center',
          maxWidth: '400px',
          background: 'white',
          padding: '40px',
          borderRadius: '16px',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
          <h1 style={{ fontSize: '20px', color: '#1A1612', marginBottom: '12px' }}>
            Fakturan hittades inte
          </h1>
          <p style={{ color: '#6B5B4F', marginBottom: '24px' }}>{error}</p>
          <button
            onClick={() => router.push('/billing')}
            style={{
              padding: '12px 24px',
              background: '#2A1F1A',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Tillbaka till fakturering
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAF8F5' }}>
      {/* Header */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid #E8E0D8',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <button
          onClick={() => router.push('/billing')}
          style={{
            background: 'none',
            border: 'none',
            color: '#5D4D3D',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
          }}
        >
          ← Tillbaka
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/lt-transparent.png" alt="LeTrend" style={{ height: '32px', width: 'auto' }} />
          <span style={{ fontSize: '18px', fontWeight: '600', color: '#1A1612' }}>
            Faktura {invoice.number}
          </span>
        </div>
        {invoice.invoicePdf ? (
          <a
            href={invoice.invoicePdf}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: '#FAF8F5',
              border: '1px solid #E5E0DA',
              borderRadius: '8px',
              color: '#6B4423',
              fontSize: '14px',
              fontWeight: '500',
              textDecoration: 'none',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Ladda ner PDF
          </a>
        ) : (
          <div style={{ width: '60px' }} />
        )}
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
        {/* Status badge */}
        <div style={{ marginBottom: '24px' }}>
          <span style={{
            display: 'inline-block',
            padding: '6px 16px',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '500',
            background: invoice.paid ? '#E8F5E9' : '#FFF3E0',
            color: invoice.paid ? '#2E7D32' : '#E65100',
          }}>
            {invoice.paid ? 'Betald' : 'Obetald'}
          </span>
        </div>

        {/* Invoice card */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          {/* Header */}
          <div style={{
            padding: '24px',
            borderBottom: '1px solid #F0EBE4',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: '12px', color: '#9A8B7A', marginBottom: '4px' }}>LETREND AB</div>
              <div style={{ fontSize: '14px', color: '#5D4D3D' }}>faktura@letrend.se</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: '#9A8B7A', marginBottom: '4px' }}>FAKTURA</div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#1A1612' }}>{invoice.number}</div>
            </div>
          </div>

          {/* Customer & Dates */}
          <div style={{
            padding: '24px',
            borderBottom: '1px solid #F0EBE4',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px',
          }}>
            <div>
              <div style={{ fontSize: '12px', color: '#9A8B7A', marginBottom: '4px' }}>KUND</div>
              <div style={{ fontWeight: '500', color: '#1A1612' }}>{invoice.customer.name}</div>
              <div style={{ fontSize: '14px', color: '#5D4D3D' }}>{invoice.customer.email}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#9A8B7A', marginBottom: '4px' }}>DATUM</div>
              <div style={{ color: '#1A1612' }}>{formatDate(invoice.created)}</div>
              {invoice.dueDate && (
                <div style={{ color: '#5D4D3D', fontSize: '14px' }}>
                  Förfaller: {formatDate(invoice.dueDate)}
                </div>
              )}
            </div>
          </div>

          {/* Line items */}
          <div style={{ padding: '24px' }}>
            <div style={{ fontSize: '12px', color: '#9A8B7A', marginBottom: '16px', textTransform: 'uppercase' }}>
              Beskrivning
            </div>
            {invoice.lineItems.map((item, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: i < invoice.lineItems.length - 1 ? '1px solid #F0EBE4' : 'none',
              }}>
                <span style={{ color: '#1A1612' }}>{item.description}</span>
                <span style={{ fontWeight: '500', color: '#1A1612' }}>{formatCurrency(item.amount)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{
            padding: '24px',
            background: '#FAF8F5',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}>
              <span style={{ color: '#5D4D3D' }}>Subtotal</span>
              <span style={{ color: '#1A1612' }}>{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.tax > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}>
                <span style={{ color: '#5D4D3D' }}>Moms (25%)</span>
                <span style={{ color: '#1A1612' }}>{formatCurrency(invoice.tax)}</span>
              </div>
            )}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '16px',
              borderTop: '1px solid #E8E0D8',
            }}>
              <span style={{ fontWeight: '600', color: '#1A1612', fontSize: '16px' }}>Totalt</span>
              <span style={{ fontWeight: '700', color: '#6B4423', fontSize: '20px' }}>{formatCurrency(invoice.total)}</span>
            </div>
          </div>
        </div>

        {/* Pay button if not paid */}
        {!invoice.paid && invoice.hostedInvoiceUrl && (
          <a
            href={invoice.hostedInvoiceUrl}
            style={{
              display: 'block',
              width: '100%',
              padding: '18px',
              background: '#2A1F1A',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '600',
              textAlign: 'center',
              textDecoration: 'none',
              marginTop: '24px',
            }}
          >
            Betala nu →
          </a>
        )}

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          fontSize: '13px',
          color: '#9A8B7A',
          marginTop: '32px',
        }}>
          Har du frågor? Kontakta{' '}
          <a href="mailto:faktura@letrend.se" style={{ color: '#6B4423' }}>
            faktura@letrend.se
          </a>
        </p>
      </div>
    </div>
  );
}
