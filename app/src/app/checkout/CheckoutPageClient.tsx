'use client';

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { getOnboardingProfileId } from '@/lib/onboarding/session';
import { loadStripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';

interface CheckoutData {
  profileId: string;
}

export default function CheckoutPageClient({
  publishableKey,
}: {
  publishableKey: string | null;
}) {
  const router = useRouter();
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey]
  );
  const checkoutData = useMemo<CheckoutData | null>(() => {
    const profileId = getOnboardingProfileId();
    return profileId ? { profileId } : null;
  }, []);
  const [error, setError] = useState<string | null>(null);
  const resolvedError =
    error ??
    (!publishableKey
      ? 'Stripe ar inte konfigurerat for den valda miljon.'
      : checkoutData
        ? null
        : 'Ingen kundprofil hittades. Vanligen borja om fran inbjudningslanken.');

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

  if (resolvedError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            maxWidth: '400px',
            background: 'white',
            padding: '40px',
            borderRadius: '16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>Fel</div>
          <h1 style={{ fontSize: '20px', color: '#1A1612', marginBottom: '12px' }}>
            Nagot gick fel
          </h1>
          <p style={{ color: '#6B5B4F', marginBottom: '24px' }}>{resolvedError}</p>
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

  if (!checkoutData || !stripePromise) return null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
      }}
    >
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
          Tillbaka
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Image src="/lt-transparent.png" alt="LeTrend" width={108} height={36} />
          <span style={{ fontSize: '16px', fontWeight: '600', color: '#1A1612' }}>
            Betalning
          </span>
        </div>
        <div style={{ width: '60px' }} />
      </div>

      <div
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: '1fr 400px',
          gap: '32px',
        }}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          }}
        >
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{
              fetchClientSecret,
              onComplete: () => {},
            }}
          >
            <EmbeddedCheckout className="embedded-checkout" />
          </EmbeddedCheckoutProvider>
        </div>

        <div
          style={{
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            height: 'fit-content',
            position: 'sticky',
            top: '88px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          }}
        >
          <h2 style={{ fontSize: '18px', color: '#1A1612', marginBottom: '20px' }}>
            LeTrend Prenumeration
          </h2>

          <p style={{ color: '#5D4D3D', fontSize: '14px', lineHeight: '1.6', marginBottom: '20px' }}>
            Slutpris inklusive moms beraknas i kassan baserat pa din faktureringsadress.
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px',
              background: '#F0FDF4',
              borderRadius: '8px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span style={{ fontSize: '13px', color: '#22C55E', fontWeight: '500' }}>
              Saker betalning via Stripe
            </span>
          </div>
        </div>
      </div>

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
