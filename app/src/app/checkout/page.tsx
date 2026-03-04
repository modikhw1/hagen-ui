'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';

// Load Stripe outside component to avoid recreating on each render
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface CheckoutData {
  email: string;
  profileId?: string;
  priceAmount: number;
  productName: string;
  customerName: string;
  interval?: string;
  scopeItems?: string[];
  invoiceText?: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get checkout data from localStorage
    const email = localStorage.getItem('pending_agreement_email');
    const profileId = localStorage.getItem('onboarding_customer_profile_id');
    const priceStr = localStorage.getItem('onboarding_price');
    const businessName = localStorage.getItem('onboarding_business_name');
    const interval = localStorage.getItem('onboarding_interval');
    const scopeItemsStr = localStorage.getItem('onboarding_scope_items');
    const invoiceText = localStorage.getItem('onboarding_invoice_text');

    // Try to get from onboarding_data as fallback
    const onboardingDataStr = localStorage.getItem('onboarding_data');
    let onboardingData = null;
    if (onboardingDataStr) {
      try {
        onboardingData = JSON.parse(onboardingDataStr);
      } catch (e) {
        console.error('Failed to parse onboarding data:', e);
      }
    }

    const finalEmail = email || '';
    const finalPrice = priceStr ? parseInt(priceStr) : onboardingData?.pricePerMonth || 0;
    const finalBusinessName = businessName || onboardingData?.businessName || '';
    const finalInterval = interval || onboardingData?.interval || 'month';
    const finalScopeItems = scopeItemsStr ? JSON.parse(scopeItemsStr) : onboardingData?.scopeItems || [];
    const finalInvoiceText = invoiceText || onboardingData?.invoiceText || '';

    if (!finalEmail) {
      setError('Ingen e-post hittades. Vänligen börja om från inbjudningslänken.');
      setLoading(false);
      return;
    }

    if (!finalPrice || finalPrice <= 0) {
      setError('Inget pris konfigurerat. Kontakta support.');
      setLoading(false);
      return;
    }

    setCheckoutData({
      email: finalEmail,
      profileId: profileId || undefined,
      priceAmount: finalPrice * 100, // Convert to öre
      productName: 'LeTrend Prenumeration',
      customerName: finalBusinessName,
      interval: finalInterval,
      scopeItems: finalScopeItems,
      invoiceText: finalInvoiceText,
    });
    setLoading(false);
  }, []);

  const fetchClientSecret = useCallback(async () => {
    if (!checkoutData) return '';

    const response = await fetch('/api/stripe/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkoutData),
    });

    const data = await response.json();

    if (data.error) {
      setError(data.error);
      return '';
    }

    return data.clientSecret;
  }, [checkoutData]);

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
          background: 'white',
          padding: '40px',
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
          <h1 style={{ fontSize: '20px', color: '#1A1612', marginBottom: '12px' }}>
            Något gick fel
          </h1>
          <p style={{ color: '#6B5B4F', marginBottom: '24px' }}>{error}</p>
          <button
            onClick={() => router.push('/onboarding')}
            style={{
              padding: '12px 24px',
              background: '#2A1F1A',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Tillbaka
          </button>
        </div>
      </div>
    );
  }

  if (!checkoutData) return null;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
    }}>
      {/* Header */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid #E8E0D8',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <button
          onClick={() => router.push('/agreement')}
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
          <img src="/lt-transparent.png" alt="LeTrend" style={{ height: '36px', width: 'auto' }} />
          <span style={{ fontSize: '16px', fontWeight: '600', color: '#1A1612' }}>
            Betalning
          </span>
        </div>
        <div style={{ width: '60px' }} />
      </div>

      {/* Order Summary */}
      <div style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '24px',
        display: 'grid',
        gridTemplateColumns: '1fr 400px',
        gap: '32px',
      }}>
        {/* Left: Checkout */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        }}>
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{
              fetchClientSecret,
              onComplete: () => {
                // Checkout completed - redirect will happen via return_url
              },
            }}
          >
            <EmbeddedCheckout
              className="embedded-checkout"
            />
          </EmbeddedCheckoutProvider>
        </div>

        {/* Right: Order Summary */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '24px',
          height: 'fit-content',
          position: 'sticky',
          top: '88px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        }}>
          <h2 style={{ fontSize: '18px', color: '#1A1612', marginBottom: '20px' }}>
            Din beställning
          </h2>

          <div style={{
            background: '#FAF8F5',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#5D4D3D', fontSize: '14px' }}>Företag</span>
              <span style={{ color: '#1A1612', fontWeight: '500', fontSize: '14px' }}>
                {checkoutData.customerName}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#5D4D3D', fontSize: '14px' }}>Produkt</span>
              <span style={{ color: '#1A1612', fontWeight: '500', fontSize: '14px' }}>
                {checkoutData.productName}
              </span>
            </div>
          </div>

          {/* Scope Items */}
          {checkoutData.scopeItems && checkoutData.scopeItems.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '14px', color: '#5D4D3D', marginBottom: '12px' }}>
                Vad som ingår
              </h3>
              <ul style={{ margin: 0, paddingLeft: '16px' }}>
                {checkoutData.scopeItems.map((item, index) => (
                  <li key={index} style={{ color: '#1A1612', fontSize: '14px', marginBottom: '6px' }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Price Breakdown */}
          <div style={{ borderTop: '1px solid #E8E0D8', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#5D4D3D' }}>Pris</span>
              <span style={{ color: '#1A1612' }}>
                {new Intl.NumberFormat('sv-SE', {
                  style: 'currency',
                  currency: 'SEK',
                  minimumFractionDigits: 0,
                }).format(checkoutData.priceAmount / 100)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: '#5D4D3D' }}>Moms (25%)</span>
              <span style={{ color: '#1A1612' }}>
                {new Intl.NumberFormat('sv-SE', {
                  style: 'currency',
                  currency: 'SEK',
                  minimumFractionDigits: 0,
                }).format(checkoutData.priceAmount * 0.25 / 100)}
              </span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '12px',
              borderTop: '1px dashed #E8E0D8',
            }}>
              <span style={{ fontWeight: '600', color: '#1A1612' }}>Totalt</span>
              <span style={{ fontWeight: '700', color: '#6B4423', fontSize: '18px' }}>
                {new Intl.NumberFormat('sv-SE', {
                  style: 'currency',
                  currency: 'SEK',
                  minimumFractionDigits: 0,
                }).format(checkoutData.priceAmount * 1.25 / 100)}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#9A8B7A', marginTop: '8px' }}>
              per {checkoutData.interval === 'month' ? 'månad' : checkoutData.interval === 'quarter' ? 'kvartal' : 'år'}
            </p>
          </div>

          {/* Secure payment badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginTop: '20px',
            padding: '12px',
            background: '#F0FDF4',
            borderRadius: '8px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span style={{ fontSize: '13px', color: '#22C55E', fontWeight: '500' }}>
              Säker betalning via Stripe
            </span>
          </div>
        </div>
      </div>

      {/* Mobile: Only show checkout */}
      <style>{`
        @media (max-width: 900px) {
          div[style*="gridTemplateColumns"] {
            grid-template-columns: 1fr !important;
          }
          div[style*="gridTemplateColumns"] > div:last-child {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
