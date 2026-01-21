'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Invoice {
  id: string;
  number: string;
  status: string;
  created: string;
  dueDate: string | null;
  customer: {
    name: string;
    email: string;
  };
  lineItems: Array<{
    description: string;
    amount: number;
    currency: string;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  hostedInvoiceUrl: string | null;
  paid: boolean;
}

export default function InvoiceLandingPage() {
  const params = useParams();
  const invoiceId = params.id as string;
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const res = await fetch(`/api/stripe/invoice/${invoiceId}`);
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
    };

    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId]);

  const formatCurrency = (amount: number) => {
    const rounded = Math.round(amount / 100);
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
    }).format(rounded);
  };

  // Loading
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
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

  // Error
  if (error || !invoice) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}>
        <div style={{
          textAlign: 'center',
          maxWidth: '400px',
          background: '#FFFFFF',
          padding: '40px',
          borderRadius: '16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
          <h1 style={{ fontSize: '20px', color: '#1A1612', marginBottom: '12px' }}>
            Fakturan hittades inte
          </h1>
          <p style={{ color: '#6B5B4F', marginBottom: '24px' }}>
            {error || 'Länken kan ha gått ut eller vara felaktig.'}
          </p>
          <p style={{ fontSize: '14px', color: '#A89080' }}>
            Kontakta oss på{' '}
            <a href="mailto:faktura@letrend.se" style={{ color: '#6B4423' }}>
              faktura@letrend.se
            </a>
          </p>
        </div>
      </div>
    );
  }

  // Paid
  if (invoice.paid) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}>
        <div style={{
          textAlign: 'center',
          maxWidth: '440px',
          background: '#FFFFFF',
          padding: '48px 40px',
          borderRadius: '16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: '#E8F5E9',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: '28px',
            color: '#2E7D32',
          }}>
            ✓
          </div>
          <h1 style={{ fontSize: '24px', color: '#1A1612', marginBottom: '12px' }}>
            Fakturan är betald
          </h1>
          <p style={{ color: '#6B5B4F', marginBottom: '24px', lineHeight: 1.6 }}>
            Tack {invoice.customer.name}! Vi har mottagit din betalning.
          </p>

          <div style={{
            background: '#F5F0EB',
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '24px',
          }}>
            <div style={{ fontSize: '14px', color: '#6B5B4F', marginBottom: '4px' }}>
              Faktura {invoice.number}
            </div>
            <div style={{ fontSize: '24px', fontWeight: '600', color: '#1A1612' }}>
              {formatCurrency(invoice.total)}
            </div>
          </div>

          <a
            href={`/invoice/${invoice.id}`}
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: 'transparent',
              border: '1px solid #E8E0D8',
              color: '#6B5B4F',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '14px',
            }}
          >
            Visa fakturadetaljer
          </a>
        </div>
      </div>
    );
  }

  // Open - awaiting payment
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
      padding: '40px 20px',
    }}>
      <div style={{
        maxWidth: '480px',
        margin: '0 auto',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            background: '#6B4423',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '16px', color: '#FAF8F5' }}>
              Le
            </span>
          </div>
          <h1 style={{ fontSize: '24px', color: '#1A1612', marginBottom: '8px' }}>
            Hej {invoice.customer.name}!
          </h1>
          <p style={{ color: '#6B5B4F', lineHeight: 1.5 }}>
            Du har en faktura från LeTrend som väntar på betalning.
          </p>
        </div>

        {/* Invoice card */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          marginBottom: '24px',
        }}>
          {/* Invoice header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid #F0EBE4',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '12px', color: '#A89080', marginBottom: '2px' }}>
                FAKTURA
              </div>
              <div style={{ fontWeight: '600', color: '#1A1612' }}>
                {invoice.number}
              </div>
            </div>
            <div style={{
              padding: '6px 12px',
              background: invoice.status === 'open' ? '#FFF3E0' : '#E3F2FD',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '500',
              color: invoice.status === 'open' ? '#E65100' : '#1565C0',
            }}>
              {invoice.status === 'open' ? 'Obetald' : invoice.status}
            </div>
          </div>

          {/* Line items */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #F0EBE4' }}>
            {invoice.lineItems.map((item, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: i < invoice.lineItems.length - 1 ? '12px' : 0,
              }}>
                <span style={{ color: '#4A3F35', fontSize: '14px' }}>
                  {item.description}
                </span>
                <span style={{ fontWeight: '500', color: '#1A1612' }}>
                  {formatCurrency(item.amount)}
                </span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div style={{ padding: '20px 24px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}>
              <span style={{ fontWeight: '600', color: '#1A1612' }}>
                Att betala
              </span>
              <span style={{ fontSize: '28px', fontWeight: '600', color: '#1A1612' }}>
                {formatCurrency(invoice.total)}
              </span>
            </div>
            {invoice.dueDate && (
              <div style={{
                fontSize: '13px',
                color: '#A89080',
                textAlign: 'right',
                marginTop: '4px',
              }}>
                Förfaller {invoice.dueDate}
              </div>
            )}
          </div>
        </div>

        {/* Pay button */}
        {invoice.hostedInvoiceUrl && (
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
              marginBottom: '16px',
            }}
          >
            Betala nu →
          </a>
        )}

        {/* View full invoice link */}
        <a
          href={`/invoice/${invoice.id}`}
          style={{
            display: 'block',
            textAlign: 'center',
            color: '#6B5B4F',
            fontSize: '14px',
            textDecoration: 'underline',
          }}
        >
          Visa fullständig faktura
        </a>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          fontSize: '13px',
          color: '#A89080',
          marginTop: '32px',
        }}>
          Frågor? Kontakta{' '}
          <a href="mailto:faktura@letrend.se" style={{ color: '#6B4423' }}>
            faktura@letrend.se
          </a>
        </p>
      </div>
    </div>
  );
}
