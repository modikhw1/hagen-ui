'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface AgreementData {
  price?: number;
  coupon?: string;
}

export default function AgreementPage() {
  const { user, loading: authLoading, profile } = useAuth();
  const router = useRouter();
  const [agreements, setAgreement] = useState<AgreementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    // Get agreement data from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const price = urlParams.get('price');
    const coupon = urlParams.get('coupon');
    
    if (price) {
      setAgreement({ 
        price: parseInt(price), 
        coupon: coupon || undefined 
      });
    } else {
      // No price in URL - redirect to pricing or show error
      setError('Inget avtal hittades');
    }
    
    setLoading(false);
  }, [user, authLoading, router]);

  const handleAccept = async () => {
    setAccepting(true);
    
    try {
      // In a real flow, this would:
      // 1. Create Stripe checkout session
      // 2. Redirect to Stripe payment
      // For now, just redirect to home with agreement completed
      router.push('/?agreement=completed');
    } catch (err) {
      console.error('Error accepting agreement:', err);
      setError('Kunde inte godkänna avtalet');
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    // Sign out and redirect to login
    const { signOut } = useAuth();
    await signOut();
    router.push('/login');
  };

  if (authLoading || loading) {
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
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
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
        }}>
          <p style={{ color: '#6B5B4F', marginBottom: '16px' }}>{error}</p>
          <button
            onClick={() => router.push('/login')}
            style={{
              padding: '12px 24px',
              background: '#2A1F1A',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Tillbaka till inloggning
          </button>
        </div>
      </div>
    );
  }

  if (!agreements) {
    return null;
  }

  const price = agreements.price || 0;
  const priceDisplay = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
  }).format(price);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
      padding: '40px 20px',
    }}>
      <div style={{
        maxWidth: '500px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '16px',
        padding: '32px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            background: 'linear-gradient(135deg, #6B4423 0%, #4A2F18 100%)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <span style={{ color: '#FAF8F5', fontSize: '20px', fontWeight: 'bold' }}>Le</span>
          </div>
          <h1 style={{ fontSize: '24px', color: '#1A1612', marginBottom: '8px' }}>
            Välkommen till LeTrend
          </h1>
          <p style={{ color: '#5D4D3D', fontSize: '14px' }}>
            Godkänn ditt avtal för att komma igång
          </p>
        </div>

        {/* Agreement Details */}
        <div style={{
          background: '#FAF8F5',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
        }}>
          <h2 style={{ fontSize: '16px', color: '#1A1612', marginBottom: '16px' }}>
            Avtalssammanfattning
          </h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#5D4D3D' }}>Månadspris</span>
            <span style={{ color: '#1A1612', fontWeight: '600' }}>{priceDisplay}</span>
          </div>
          
          {agreements.coupon && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: '#5D4D3D' }}>Rabattkod</span>
              <span style={{ color: '#2E7D32', fontWeight: '600' }}>{agreements.coupon}</span>
            </div>
          )}
          
          <div style={{ 
            borderTop: '1px solid #E5E0DA', 
            paddingTop: '12px',
            display: 'flex', 
            justifyContent: 'space-between' 
          }}>
            <span style={{ color: '#1A1612', fontWeight: '600' }}>Att betala</span>
            <span style={{ color: '#6B4423', fontWeight: '700', fontSize: '18px' }}>{priceDisplay}</span>
          </div>
        </div>

        {/* Terms */}
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '12px', color: '#5D4D3D', lineHeight: '1.5' }}>
            Genom att klicka "Godkänn och betala" godkänner du våra 
            <a href="/terms" style={{ color: '#6B4423' }}> användarvillkor</a> och 
            <a href="/privacy" style={{ color: '#6B4423' }}> integritetspolicy</a>. 
            Din prenumeration debiteras månadsvis och kan när som helst sägas upp.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleDecline}
            style={{
              flex: 1,
              padding: '14px',
              background: 'transparent',
              color: '#5D4D3D',
              border: '1px solid #E5E0DA',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Avböj
          </button>
          <button
            onClick={handleAccept}
            disabled={accepting}
            style={{
              flex: 2,
              padding: '14px',
              background: 'linear-gradient(135deg, #6B4423 0%, #4A2F18 100%)',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '8px',
              cursor: accepting ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              opacity: accepting ? 0.7 : 1,
            }}
          >
            {accepting ? 'Godkänner...' : 'Godkänn och fortsätt till betalning'}
          </button>
        </div>
      </div>
    </div>
  );
}
