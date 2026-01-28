'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AgreementConfirmation } from '@/components';
import { useRouter } from 'next/navigation';

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

export default function AgreementPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push('/login');
  }, [signOut, router]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    const fetchAgreement = async () => {
      try {
        // Fetch agreement and profile in parallel
        const [agreementRes, profileRes] = await Promise.all([
          fetch(`/api/stripe/pending-agreement?email=${encodeURIComponent(user.email || '')}`),
          fetch('/api/profile'),
        ]);

        const data = await agreementRes.json();
        const profileData = await profileRes.json();

        if (data.error) {
          setError(data.error);
        } else if (data.agreement) {
          if (data.agreement.status === 'active') {
            router.push('/');
            return;
          }
          // Add businessName from profile
          setAgreement({
            ...data.agreement,
            businessName: profileData.profile?.business_name || undefined,
          });
        } else {
          router.push('/pricing');
        }
      } catch (err) {
        console.error('Error fetching agreement:', err);
        setError('Kunde inte hämta avtalsinfo');
      } finally {
        setLoading(false);
      }
    };

    fetchAgreement();
  }, [user, authLoading, router]);

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
            onClick={() => router.push('/pricing')}
            style={{
              padding: '12px 24px',
              background: '#2A1F1A',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Se paket
          </button>
        </div>
      </div>
    );
  }

  if (!agreement) {
    return null;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
      paddingTop: '60px',
      paddingBottom: '40px',
    }}>
      <AgreementConfirmation
        agreement={agreement}
        onCompleted={() => {
          // Force full page reload to ensure fresh state
          window.location.href = '/?agreement=completed';
        }}
        onLogout={handleLogout}
      />
    </div>
  );
}
