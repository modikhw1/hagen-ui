'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface Agreement {
  status: 'pending' | 'pending_invoice' | 'active' | 'past_due' | 'cancelled';
  customerId: string;
  customerName?: string;
  businessName?: string;
  subscriptionId?: string;
  invoiceId?: string;
  pricePerMonth?: number;
  amount?: number;
  currency: string;
  productName?: string;
  description?: string;
  scope?: string;
  scopeItems?: string[];
  hostedInvoiceUrl?: string;
  cancelAt?: string;
  currentPeriodEnd?: string;
}

interface AgreementConfirmationProps {
  agreement: Agreement;
  onCompleted?: () => void;
  onLogout?: () => void;
}

// Moms-sats (25% i Sverige)
const VAT_RATE = 0.25;

// Standard scope-punkter för LeTrend (businessName ersätts dynamiskt)
const getScopeItems = (businessName: string) => [
  `Handplockade koncept för ${businessName}, antal enligt överenskommelse`,
  'Löpande planering & uppföljning',
  'Dedikerad kontakt via mail & telefon',
];

export function AgreementConfirmation({ agreement, onCompleted, onLogout }: AgreementConfirmationProps) {
  const [loading, setLoading] = useState(false);
  const [invoiceOpened, setInvoiceOpened] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const { user, refreshProfile } = useAuth();

  const formatWholeKronor = (amount: number, currency: string) => {
    const rounded = Math.round(amount / 100);
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(rounded);
  };

  // Check if invoice is paid
  const checkPaymentStatus = async () => {
    if (!agreement.invoiceId) return false;

    try {
      const res = await fetch(`/api/stripe/invoice/${agreement.invoiceId}`);
      const data = await res.json();
      return data.invoice?.paid === true || data.invoice?.status === 'paid';
    } catch {
      return false;
    }
  };

  const handleComplete = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/stripe/complete-agreement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          customerId: agreement.customerId,
          subscriptionId: agreement.subscriptionId,
          invoiceId: agreement.invoiceId,
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error('Complete agreement error:', data.error);
        alert('Något gick fel. Försök igen.');
        return;
      }

      // If already paid, redirect immediately
      if (data.paid) {
        await refreshProfile();
        onCompleted?.();
        return;
      }

      // Open invoice in new tab and show "I've paid" button
      if (data.url && data.openInNewTab) {
        window.open(data.url, '_blank');
        setInvoiceOpened(true);
        setLoading(false);
        return;
      }

      // Regular redirect (for checkout sessions)
      if (data.url) {
        window.location.href = data.url;
      }

      onCompleted?.();
    } catch (err) {
      console.error('Complete agreement error:', err);
      alert('Något gick fel. Försök igen.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPayment = async () => {
    setCheckingPayment(true);

    try {
      const isPaid = await checkPaymentStatus();

      if (isPaid) {
        // Re-sync Stripe data to Supabase profile
        // This ensures has_paid and subscription_status are updated
        if (user?.id && user?.email) {
          await fetch('/api/stripe/sync-customer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, email: user.email }),
          });
        }
        await refreshProfile();
        onCompleted?.();
      } else {
        alert('Betalningen verkar inte ha genomförts ännu. Vänligen slutför betalningen i det andra fönstret.');
      }
    } catch {
      alert('Kunde inte verifiera betalning. Försök igen.');
    } finally {
      setCheckingPayment(false);
    }
  };

  const priceExclVat = agreement.pricePerMonth || agreement.amount || 0;
  const vatAmount = Math.round(priceExclVat * VAT_RATE);
  const totalInclVat = priceExclVat + vatAmount;
  const isSubscription = !!agreement.subscriptionId;
  const customerName = agreement.customerName || 'kund';
  const businessName = agreement.businessName || 'er verksamhet';

  // Generate scope items with business name
  const scopeItems = getScopeItems(businessName);

  // Past due - payment failed state
  if (agreement.status === 'past_due') {
    return (
      <div style={{
        maxWidth: '480px',
        margin: '0 auto',
        padding: '32px 20px',
      }}>
        {/* Warning banner */}
        <div style={{
          background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
          border: '1px solid #FFB74D',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '16px',
        }}>
          <span style={{ fontSize: '24px' }}>⚠️</span>
          <div>
            <h2 style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#E65100',
              margin: '0 0 4px',
            }}>
              Betalning misslyckades
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#F57C00',
              margin: 0,
              lineHeight: '1.5',
            }}>
              Vi kunde inte genomföra den senaste betalningen. Uppdatera din betalningsmetod för att fortsätta använda tjänsten.
            </p>
          </div>
        </div>

        {/* Retry payment card */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E5E5E5',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}>
            <span style={{ color: '#666666' }}>Utestående belopp</span>
            <span style={{ fontSize: '24px', fontWeight: '600', color: '#E65100' }}>
              {formatWholeKronor(totalInclVat, agreement.currency)}
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#999999', margin: 0 }}>
            inkl. moms
          </p>
        </div>

        <button
          onClick={handleComplete}
          disabled={loading}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '8px',
            border: 'none',
            background: loading ? '#CCCCCC' : '#E65100',
            color: '#FFFFFF',
            fontSize: '15px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Laddar...' : 'Uppdatera betalning'}
        </button>

        <p style={{
          textAlign: 'center',
          fontSize: '13px',
          color: '#999999',
          marginTop: '16px',
        }}>
          Behöver du hjälp?{' '}
          <a href="mailto:faktura@letrend.se" style={{ color: '#6B4423' }}>
            Kontakta oss
          </a>
        </p>

        {onLogout && (
          <button
            onClick={onLogout}
            style={{
              display: 'block',
              width: '100%',
              marginTop: '24px',
              padding: '12px',
              background: 'transparent',
              border: 'none',
              color: '#999999',
              fontSize: '13px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Logga ut
          </button>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Cancelled state
  if (agreement.status === 'cancelled') {
    return (
      <div style={{
        maxWidth: '480px',
        margin: '0 auto',
        padding: '32px 20px',
        textAlign: 'center',
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          background: '#F5F5F5',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          fontSize: '28px',
        }}>
          📋
        </div>

        <h1 style={{
          fontSize: '24px',
          fontWeight: '600',
          color: '#1A1A1A',
          marginBottom: '12px',
        }}>
          Avtalet är avslutat
        </h1>

        <p style={{
          color: '#666666',
          marginBottom: '32px',
          lineHeight: '1.6',
        }}>
          Ditt avtal med LeTrend har avslutats. Vi hoppas att vi ses igen!
        </p>

        <div style={{
          background: '#F5F5F5',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '32px',
        }}>
          <p style={{
            fontSize: '14px',
            color: '#666666',
            margin: 0,
          }}>
            Vill du komma igång igen? Vi hjälper dig gärna att hitta rätt paket.
          </p>
        </div>

        <a
          href="mailto:kontakt@letrend.se?subject=Vill%20starta%20igen"
          style={{
            display: 'inline-block',
            padding: '14px 32px',
            background: '#1A1A1A',
            color: '#FFFFFF',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: '500',
            fontSize: '15px',
          }}
        >
          Kontakta oss
        </a>

        {onLogout && (
          <button
            onClick={onLogout}
            style={{
              display: 'block',
              width: '100%',
              marginTop: '24px',
              padding: '12px',
              background: 'transparent',
              border: 'none',
              color: '#999999',
              fontSize: '13px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Logga ut
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '480px',
      margin: '0 auto',
      padding: '32px 20px',
    }}>
      {/* Greeting */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontSize: '26px',
          fontWeight: '600',
          color: '#1A1A1A',
          margin: '0 0 12px',
        }}>
          Välkommen ombord ✨
        </h1>
        <p style={{
          fontSize: '15px',
          color: '#555555',
          margin: 0,
          lineHeight: '1.6',
        }}>
          Hej {customerName}! Välkommen till LeTrend. Vi ser fram emot att samarbeta.
        </p>
      </div>

      {/* Agreement card */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E5E5E5',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '24px',
      }}>
        {/* Product header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #F0F0F0',
        }}>
          <h2 style={{
            fontSize: '17px',
            fontWeight: '600',
            color: '#1A1A1A',
            margin: 0,
          }}>
            LeTrend Standard
          </h2>
        </div>

        {/* Scope items */}
        {scopeItems.length > 0 && (
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid #F0F0F0',
          }}>
            <ul style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
            }}>
              {scopeItems.map((item, i) => (
                <li key={i} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  fontSize: '14px',
                  color: '#333333',
                  marginBottom: i < scopeItems.length - 1 ? '12px' : 0,
                  lineHeight: '1.4',
                }}>
                  <span style={{
                    color: '#22863A',
                    fontWeight: '500',
                    flexShrink: 0,
                    marginTop: '1px',
                  }}>
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Price section */}
        <div style={{ padding: '20px 24px' }}>
          {/* Main price */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '8px',
          }}>
            <span style={{
              fontSize: '14px',
              color: '#666666',
            }}>
              {isSubscription ? 'Månadsbelopp' : 'Belopp'} exkl. moms
            </span>
            <span style={{
              fontSize: '24px',
              fontWeight: '600',
              color: '#1A1A1A',
            }}>
              {formatWholeKronor(priceExclVat, agreement.currency)}
              {isSubscription && (
                <span style={{
                  fontSize: '14px',
                  fontWeight: '400',
                  color: '#999999',
                }}>/mån</span>
              )}
            </span>
          </div>

          {/* VAT */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            paddingTop: '8px',
            borderTop: '1px dashed #E5E5E5',
          }}>
            <span style={{
              fontSize: '13px',
              color: '#888888',
            }}>
              Moms (25%)
            </span>
            <span style={{
              fontSize: '14px',
              color: '#888888',
            }}>
              +{formatWholeKronor(vatAmount, agreement.currency)}
            </span>
          </div>

          {/* Total */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid #E5E5E5',
          }}>
            <span style={{
              fontSize: '14px',
              fontWeight: '500',
              color: '#1A1A1A',
            }}>
              Totalt inkl. moms
            </span>
            <span style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#1A1A1A',
            }}>
              {formatWholeKronor(totalInclVat, agreement.currency)}
              {isSubscription && (
                <span style={{
                  fontSize: '13px',
                  fontWeight: '400',
                  color: '#999999',
                }}>/mån</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Fine print */}
      <p style={{
        fontSize: '12px',
        color: '#999999',
        textAlign: 'center',
        marginBottom: '20px',
        lineHeight: '1.5',
      }}>
        {isSubscription
          ? 'Prenumerationen förnyas automatiskt. Avsluta när som helst.'
          : 'Engångsbetalning.'}
      </p>

      {/* Buttons */}
      {!invoiceOpened ? (
        <button
          onClick={handleComplete}
          disabled={loading}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '8px',
            border: 'none',
            background: loading ? '#CCCCCC' : '#1A1A1A',
            color: '#FFFFFF',
            fontSize: '15px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'background 0.15s ease',
          }}
        >
          {loading ? (
            <>
              <span style={{
                width: '16px',
                height: '16px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              Laddar...
            </>
          ) : (
            'Gå till betalning'
          )}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{
            fontSize: '14px',
            color: '#666666',
            textAlign: 'center',
            margin: 0,
          }}>
            Fakturan har öppnats i en ny flik. Slutför betalningen där och klicka sedan nedan.
          </p>

          <button
            onClick={handleVerifyPayment}
            disabled={checkingPayment}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '8px',
              border: 'none',
              background: checkingPayment ? '#CCCCCC' : '#22863A',
              color: '#FFFFFF',
              fontSize: '15px',
              fontWeight: '600',
              cursor: checkingPayment ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background 0.15s ease',
            }}
          >
            {checkingPayment ? (
              <>
                <span style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                Verifierar...
              </>
            ) : (
              '✓ Jag har betalat'
            )}
          </button>

          <button
            onClick={handleComplete}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #E5E5E5',
              background: 'transparent',
              color: '#666666',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Öppna fakturan igen
          </button>
        </div>
      )}

      {onLogout && (
        <button
          onClick={onLogout}
          style={{
            display: 'block',
            width: '100%',
            marginTop: '32px',
            padding: '12px',
            background: 'transparent',
            border: 'none',
            color: '#999999',
            fontSize: '13px',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Logga ut
        </button>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
