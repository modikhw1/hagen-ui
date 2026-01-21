'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';

const colors = {
  primary: '#4A2F18',
  secondary: '#6B4423',
  bg: '#FAF8F5',
  card: '#FFFFFF',
  muted: '#F0EBE4',
  text: '#1A1612',
  textMuted: '#7D6E5D',
  border: '#E5DED4',
};

interface LineItem {
  description: string;
  period: { start: string; end: string } | null;
  quantity: number;
  unitAmount: number;
  amount: number;
  currency: string;
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  created: string;
  dueDate: string | null;
  customer: {
    name: string;
    email: string;
    address: {
      line1: string;
      line2: string;
      postalCode: string;
      city: string;
      country: string;
    } | null;
  };
  lineItems: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  hostedInvoiceUrl: string | null;
  paid: boolean;
}

// Company info - configure via environment variables
const companyInfo = {
  name: process.env.NEXT_PUBLIC_COMPANY_NAME || 'LeTrend',
  org: process.env.NEXT_PUBLIC_COMPANY_ORG || '', // Set in .env.local
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || 'Hågavägen 246',
  postal: process.env.NEXT_PUBLIC_COMPANY_POSTAL || '752 63 Uppsala',
  country: process.env.NEXT_PUBLIC_COMPANY_COUNTRY || 'Sverige',
  phone: process.env.NEXT_PUBLIC_COMPANY_PHONE || '+46 73 822 22 77',
  email: process.env.NEXT_PUBLIC_COMPANY_EMAIL || 'faktura@letrend.se',
  bankgiro: process.env.NEXT_PUBLIC_COMPANY_BANKGIRO || '', // Set in .env.local
};

export default function InvoicePage() {
  const params = useParams();
  const invoiceId = params.id as string;
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

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

  const formatCurrency = (amount: number, currency: string) => {
    const rounded = Math.round(amount / 100);
    return rounded.toLocaleString('sv-SE') + ' kr';
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePayment = () => {
    if (invoice?.hostedInvoiceUrl) {
      window.location.href = invoice.hostedInvoiceUrl;
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: colors.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: `3px solid ${colors.border}`,
          borderTopColor: colors.primary,
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
        background: colors.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: colors.textMuted, marginBottom: '16px' }}>{error || 'Fakturan hittades inte'}</p>
        </div>
      </div>
    );
  }

  const reference = `LT-${invoice.number?.replace(/\D/g, '').slice(-4) || '0001'}`;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-container {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            max-width: 100% !important;
          }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: colors.bg,
        padding: '32px 16px',
        fontFamily: '"DM Sans", system-ui, sans-serif',
        fontSize: 14,
        color: colors.text,
        lineHeight: 1.5,
      }}>
        {/* Action buttons - not printed */}
        <div className="no-print" style={{
          maxWidth: 680,
          margin: '0 auto 24px',
          display: 'flex',
          gap: 12,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={handlePrint}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              color: colors.text,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            Skriv ut / Spara PDF
          </button>
          {!invoice.paid && invoice.hostedInvoiceUrl && (
            <button
              onClick={handlePayment}
              style={{
                padding: '10px 20px',
                background: colors.primary,
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Betala nu
            </button>
          )}
        </div>

        {/* Invoice card */}
        <div
          ref={printRef}
          className="print-container"
          style={{
            maxWidth: 680,
            margin: '0 auto',
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '24px 32px',
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36,
                height: 36,
                background: colors.primary,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 14, color: '#fff' }}>Le</span>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: colors.primary }}>{companyInfo.name}</div>
                {companyInfo.org && <div style={{ fontSize: 12, color: colors.textMuted }}>{companyInfo.org}</div>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: colors.primary }}>FAKTURA</div>
              <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{invoice.number}</div>
            </div>
          </div>

          {/* Info grid */}
          <div style={{
            padding: '24px 32px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 24,
            borderBottom: `1px solid ${colors.border}`,
            fontSize: 13,
          }}>
            <div>
              <div style={{ color: colors.textMuted, marginBottom: 4 }}>Fakturadatum</div>
              <div style={{ fontWeight: 500 }}>{invoice.created}</div>
            </div>
            <div>
              <div style={{ color: colors.textMuted, marginBottom: 4 }}>Förfallodatum</div>
              <div style={{ fontWeight: 500 }}>{invoice.dueDate || invoice.created}</div>
            </div>
            <div>
              <div style={{ color: colors.textMuted, marginBottom: 4 }}>Referens</div>
              <div style={{ fontWeight: 500 }}>{reference}</div>
            </div>
          </div>

          {/* Addresses */}
          <div style={{
            padding: '24px 32px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 48,
            borderBottom: `1px solid ${colors.border}`,
            fontSize: 13,
          }}>
            <div>
              <div style={{ color: colors.textMuted, marginBottom: 8, fontWeight: 500 }}>Avsändare</div>
              <div>{companyInfo.name}</div>
              {companyInfo.address && <div>{companyInfo.address}</div>}
              {companyInfo.postal && <div>{companyInfo.postal}</div>}
              {companyInfo.phone && <div style={{ marginTop: 8, color: colors.textMuted }}>{companyInfo.phone}</div>}
              {companyInfo.email && <div style={{ color: colors.textMuted }}>{companyInfo.email}</div>}
            </div>
            <div>
              <div style={{ color: colors.textMuted, marginBottom: 8, fontWeight: 500 }}>Mottagare</div>
              <div>{invoice.customer.name}</div>
              {invoice.customer.address && (
                <>
                  <div>{invoice.customer.address.line1}</div>
                  {invoice.customer.address.line2 && <div>{invoice.customer.address.line2}</div>}
                  <div>{invoice.customer.address.postalCode} {invoice.customer.address.city}</div>
                </>
              )}
              <div style={{ marginTop: 8, color: colors.textMuted }}>{invoice.customer.email}</div>
            </div>
          </div>

          {/* Line items table */}
          <div style={{ padding: '24px 32px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', color: colors.textMuted, fontWeight: 500 }}>Beskrivning</th>
                  <th style={{ textAlign: 'center', padding: '8px 0', color: colors.textMuted, fontWeight: 500, width: 60 }}>Antal</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', color: colors.textMuted, fontWeight: 500, width: 100 }}>À-pris</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', color: colors.textMuted, fontWeight: 500, width: 100 }}>Belopp</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: '12px 0' }}>
                      <div>{item.description}</div>
                      {item.period && (
                        <div style={{ fontSize: 12, color: colors.textMuted }}>
                          {item.period.start} – {item.period.end}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 0' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right', padding: '12px 0' }}>{formatCurrency(item.unitAmount, item.currency)}</td>
                    <td style={{ textAlign: 'right', padding: '12px 0' }}>{formatCurrency(item.amount, item.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{
              marginTop: 16,
              marginLeft: 'auto',
              width: 240,
              fontSize: 13,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ color: colors.textMuted }}>Netto</span>
                <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ color: colors.textMuted }}>Moms (25%)</span>
                <span>{formatCurrency(invoice.tax, invoice.currency)}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 0 6px',
                borderTop: `2px solid ${colors.primary}`,
                marginTop: 8,
                fontWeight: 600,
                fontSize: 15,
              }}>
                <span>Att betala</span>
                <span>{formatCurrency(invoice.total, invoice.currency)}</span>
              </div>
            </div>
          </div>

          {/* Payment info */}
          {!invoice.paid && (
            <div style={{
              margin: '0 32px 24px',
              padding: 20,
              background: colors.muted,
              borderRadius: 6,
              fontSize: 13,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 12, color: colors.primary }}>Betalningsinformation</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {companyInfo.bankgiro && (
                  <div>
                    <div style={{ color: colors.textMuted }}>Bankgiro</div>
                    <div style={{ fontWeight: 500, fontFamily: 'monospace' }}>{companyInfo.bankgiro}</div>
                  </div>
                )}
                <div>
                  <div style={{ color: colors.textMuted }}>Belopp</div>
                  <div style={{ fontWeight: 500 }}>{formatCurrency(invoice.total, invoice.currency)}</div>
                </div>
                <div>
                  <div style={{ color: colors.textMuted }}>Referens</div>
                  <div style={{ fontWeight: 500, fontFamily: 'monospace' }}>{reference}</div>
                </div>
                <div>
                  <div style={{ color: colors.textMuted }}>Förfaller</div>
                  <div style={{ fontWeight: 500 }}>{invoice.dueDate || invoice.created}</div>
                </div>
              </div>
              {!companyInfo.bankgiro && invoice.hostedInvoiceUrl && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
                  <div style={{ color: colors.textMuted, marginBottom: 8 }}>Betala enkelt med kort via knappen "Betala nu" ovan</div>
                </div>
              )}
            </div>
          )}

          {/* Paid badge */}
          {invoice.paid && (
            <div style={{
              margin: '0 32px 24px',
              padding: 16,
              background: '#E8F5E9',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              color: '#2E7D32',
              textAlign: 'center',
            }}>
              Betald
            </div>
          )}

          {/* Footer */}
          <div style={{
            padding: '16px 32px',
            borderTop: `1px solid ${colors.border}`,
            fontSize: 12,
            color: colors.textMuted,
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span>Vid frågor, kontakta {companyInfo.email}</span>
            <span>Sida 1 av 1</span>
          </div>
        </div>
      </div>
    </>
  );
}
