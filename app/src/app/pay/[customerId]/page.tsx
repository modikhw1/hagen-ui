'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Agreement {
  status: 'pending' | 'pending_invoice' | 'active' | 'past_due' | 'cancelled';
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  subscriptionId?: string;
  invoiceId?: string;
  pricePerMonth?: number;
  amount?: number;
  currency: string;
  productName?: string;
  hostedInvoiceUrl?: string;
  cancelAt?: string;
  currentPeriodEnd?: string;
}

const VAT_RATE = 0.25;

export default function PublicPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.customerId as string;

  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentStarted, setPaymentStarted] = useState(false);

  useEffect(() => {
    const fetchAgreement = async () => {
      try {
        const res = await fetch(`/api/stripe/public-agreement?customerId=${encodeURIComponent(customerId)}`);
        const data = await res.json();

        if (data.error) {
          setError(data.error);
        } else if (data.agreement) {
          setAgreement(data.agreement);
        } else {
          setError('Kunde inte hitta avtalet');
        }
      } catch (err) {
        console.error('Error fetching agreement:', err);
        setError('Något gick fel');
      } finally {
        setLoading(false);
      }
    };

    if (customerId) {
      fetchAgreement();
    }
  }, [customerId]);

  const formatCurrency = (amount: number, currency: string) => {
    const rounded = Math.round(amount / 100);
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
    }).format(rounded);
  };

  const handlePayment = () => {
    if (agreement?.hostedInvoiceUrl) {
      setPaymentStarted(true);
      window.open(agreement.hostedInvoiceUrl, '_blank');
    }
  };

  const handleCheckStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stripe/public-agreement?customerId=${encodeURIComponent(customerId)}`);
      const data = await res.json();

      if (data.agreement?.status === 'active') {
        setAgreement(data.agreement);
      } else {
        setAgreement(data.agreement);
        alert('Betalningen verkar inte ha gått igenom ännu. Kontrollera i fakturafönstret.');
      }
    } catch {
      alert('Kunde inte kontrollera status');
    } finally {
      setLoading(false);
    }
  };

  // Loading state
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

  // Error state
  if (error) {
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
          <h1 style={{ fontSize: '20px', color: '#1A1612', marginBottom: '8px' }}>
            Länken fungerar inte
          </h1>
          <p style={{ color: '#6B5B4F', marginBottom: '24px', lineHeight: 1.5 }}>
            {error}
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

  if (!agreement) return null;

  const priceExclVat = agreement.pricePerMonth || agreement.amount || 0;
  const vatAmount = Math.round(priceExclVat * VAT_RATE);
  const totalInclVat = priceExclVat + vatAmount;
  const isSubscription = !!agreement.subscriptionId;

  // Active subscription - success state
  if (agreement.status === 'active') {
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
          }}>
            ✓
          </div>
          <h1 style={{ fontSize: '24px', color: '#1A1612', marginBottom: '12px' }}>
            Tack för din betalning!
          </h1>
          <p style={{ color: '#6B5B4F', marginBottom: '32px', lineHeight: 1.6 }}>
            Ditt avtal är nu aktivt. Vi skickar en bekräftelse till{' '}
            <strong>{agreement.customerEmail}</strong>.
          </p>

          <div style={{
            background: '#F5F0EB',
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '24px',
          }}>
            <div style={{ fontSize: '14px', color: '#6B5B4F', marginBottom: '4px' }}>
              {agreement.productName || 'LeTrend'}
            </div>
            <div style={{ fontSize: '24px', fontWeight: '600', color: '#1A1612' }}>
              {formatCurrency(priceExclVat, agreement.currency)}
              {isSubscription && <span style={{ fontSize: '14px', color: '#A89080' }}>/mån</span>}
            </div>
          </div>

          <p style={{ fontSize: '14px', color: '#A89080' }}>
            Har du frågor? Kontakta oss på{' '}
            <a href="mailto:kontakt@letrend.se" style={{ color: '#6B4423' }}>
              kontakt@letrend.se
            </a>
          </p>
        </div>
      </div>
    );
  }

  // Cancelled subscription
  if (agreement.status === 'cancelled') {
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
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <h1 style={{ fontSize: '24px', color: '#1A1612', marginBottom: '12px' }}>
            Avtalet är avslutat
          </h1>
          <p style={{ color: '#6B5B4F', marginBottom: '24px', lineHeight: 1.6 }}>
            Detta avtal har avslutats. Vill du komma igång igen?
          </p>
          <a
            href="mailto:kontakt@letrend.se?subject=Vill%20starta%20igen"
            style={{
              display: 'inline-block',
              padding: '14px 28px',
              background: '#2A1F1A',
              color: '#FAF8F5',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: '500',
            }}
          >
            Kontakta oss
          </a>
        </div>
      </div>
    );
  }

  // Past due - payment failed
  if (agreement.status === 'past_due') {
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
          maxWidth: '440px',
          background: '#FFFFFF',
          padding: '40px',
          borderRadius: '16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}>
          <div style={{
            background: '#FFF3E0',
            border: '1px solid #FFE0B2',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <div>
              <div style={{ fontWeight: '600', color: '#E65100', fontSize: '14px' }}>
                Betalning misslyckades
              </div>
              <div style={{ fontSize: '13px', color: '#F57C00' }}>
                Vänligen uppdatera din betalningsmetod
              </div>
            </div>
          </div>

          <h1 style={{ fontSize: '20px', color: '#1A1612', marginBottom: '8px' }}>
            Hej {agreement.customerName || 'där'}!
          </h1>
          <p style={{ color: '#6B5B4F', marginBottom: '24px', lineHeight: 1.5 }}>
            Vi kunde inte genomföra betalningen för ditt avtal.
            Klicka nedan för att slutföra betalningen.
          </p>

          <div style={{
            background: '#F5F0EB',
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#6B5B4F' }}>Belopp</span>
              <span style={{ fontWeight: '600' }}>{formatCurrency(totalInclVat, agreement.currency)}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#A89080' }}>
              inkl. moms
            </div>
          </div>

          <button
            onClick={handlePayment}
            style={{
              width: '100%',
              padding: '16px',
              background: '#E65100',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Betala nu
          </button>
        </div>
      </div>
    );
  }

  // Pending - waiting for payment
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
            Välkommen, {agreement.customerName || 'där'}!
          </h1>
          <p style={{ color: '#6B5B4F', lineHeight: 1.5 }}>
            Ditt avtal med LeTrend väntar på betalning.
          </p>
        </div>

        {/* Agreement card */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          marginBottom: '24px',
        }}>
          {/* Product */}
          <div style={{
            padding: '24px',
            borderBottom: '1px solid #F0EBE4',
          }}>
            <div style={{ fontSize: '12px', color: '#A89080', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Avtal
            </div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#1A1612' }}>
              {agreement.productName || 'LeTrend Standard'}
            </div>
          </div>

          {/* Price breakdown */}
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: '#6B5B4F' }}>
                {isSubscription ? 'Månadsbelopp' : 'Belopp'} exkl. moms
              </span>
              <span style={{ fontWeight: '500' }}>
                {formatCurrency(priceExclVat, agreement.currency)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: '#A89080' }}>Moms (25%)</span>
              <span style={{ color: '#A89080' }}>+{formatCurrency(vatAmount, agreement.currency)}</span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '12px',
              borderTop: '1px solid #F0EBE4',
            }}>
              <span style={{ fontWeight: '600', color: '#1A1612' }}>Totalt</span>
              <span style={{ fontSize: '20px', fontWeight: '600', color: '#1A1612' }}>
                {formatCurrency(totalInclVat, agreement.currency)}
                {isSubscription && <span style={{ fontSize: '14px', color: '#A89080' }}>/mån</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Payment button */}
        {!paymentStarted ? (
          <button
            onClick={handlePayment}
            disabled={!agreement.hostedInvoiceUrl}
            style={{
              width: '100%',
              padding: '18px',
              background: agreement.hostedInvoiceUrl ? '#2A1F1A' : '#CCCCCC',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: agreement.hostedInvoiceUrl ? 'pointer' : 'not-allowed',
              marginBottom: '16px',
            }}
          >
            Gå till betalning →
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{
              textAlign: 'center',
              color: '#6B5B4F',
              fontSize: '14px',
              margin: 0,
              lineHeight: 1.5,
            }}>
              Fakturan har öppnats i en ny flik. Slutför betalningen där.
            </p>
            <button
              onClick={handleCheckStatus}
              style={{
                width: '100%',
                padding: '16px',
                background: '#22863A',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              ✓ Jag har betalat
            </button>
            <button
              onClick={handlePayment}
              style={{
                width: '100%',
                padding: '14px',
                background: 'transparent',
                color: '#6B5B4F',
                border: '1px solid #E8E0D8',
                borderRadius: '12px',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Öppna fakturan igen
            </button>
          </div>
        )}

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          fontSize: '13px',
          color: '#A89080',
          marginTop: '24px',
        }}>
          {isSubscription
            ? 'Prenumerationen förnyas automatiskt. Avsluta när som helst.'
            : 'Engångsbetalning.'
          }
          <br /><br />
          Frågor? Kontakta{' '}
          <a href="mailto:faktura@letrend.se" style={{ color: '#6B4423' }}>
            faktura@letrend.se
          </a>
        </p>
      </div>
    </div>
  );
}
