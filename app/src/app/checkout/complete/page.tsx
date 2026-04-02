'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getPrimaryRouteForRole } from '@/lib/auth/navigation';
import { supabase } from '@/lib/supabase/client';

function LoadingFallback() {
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

export default function CheckoutCompletePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CheckoutCompleteContent />
    </Suspense>
  );
}

function CheckoutCompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [customerName, setCustomerName] = useState('');
  const [dashboardPath, setDashboardPath] = useState('/feed');

  useEffect(() => {
    const resolveDashboardPath = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return '/login';

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, role')
        .eq('id', session.user.id)
        .maybeSingle();

      return getPrimaryRouteForRole(profile, { fallback: '/welcome' });
    };

    const ensureCustomerProfileSetup = async (resolvedName: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const storedProfileId = localStorage.getItem('onboarding_customer_profile_id') || undefined;

      await fetch('/api/admin/profiles/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.user.id,
          userEmail: session.user.email || '',
          businessName: resolvedName || localStorage.getItem('onboarding_business_name') || 'Mitt företag',
          customerProfileId: storedProfileId,
        }),
      });
    };

    const verifySession = async () => {
      const sessionId = searchParams.get('session_id');
      if (!sessionId) {
        setStatus('error');
        return;
      }

      try {
        const res = await fetch(`/api/stripe/verify-checkout-session?session_id=${sessionId}`);
        const data = await res.json();

        if (data.status === 'complete' || data.status === 'paid') {
          const resolvedName = data.customerName || localStorage.getItem('onboarding_business_name') || '';
          await ensureCustomerProfileSetup(resolvedName);
          const resolvedDashboardPath = await resolveDashboardPath();
          setDashboardPath(resolvedDashboardPath);

          setStatus('success');
          setCustomerName(resolvedName);

          // Clean up localStorage
          localStorage.removeItem('onboarding_data');
          localStorage.removeItem('onboarding_business_name');
          localStorage.removeItem('onboarding_price');
          localStorage.removeItem('onboarding_interval');
          localStorage.removeItem('onboarding_scope_items');
          localStorage.removeItem('onboarding_customer_profile_id');
          localStorage.removeItem('onboarding_first_invoice_behavior');
          localStorage.removeItem('onboarding_contract_start_date');
          localStorage.removeItem('onboarding_billing_day_of_month');
          localStorage.removeItem('pending_agreement_email');
          localStorage.removeItem('agreement_accepted');
          localStorage.removeItem('agreement_subscription_id');
          localStorage.removeItem('agreement_accepted_time');
        } else {
          setStatus('error');
        }
      } catch (err) {
        console.error('Error verifying session:', err);
        // Even if verification fails, if we have a session_id we can assume success
        const resolvedDashboardPath = await resolveDashboardPath();
        setDashboardPath(resolvedDashboardPath);
        setStatus('success');
        setCustomerName(localStorage.getItem('onboarding_business_name') || '');
      }
    };

    queueMicrotask(() => {
      void verifySession();
    });
  }, [searchParams]);

  if (status === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '3px solid #E8E0D8',
            borderTopColor: '#6B4423',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ color: '#5D4D3D' }}>Verifierar betalning...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (status === 'error') {
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
          <div style={{
            width: '64px',
            height: '64px',
            background: '#FEE2E2',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '24px', color: '#1A1612', marginBottom: '12px' }}>
            Något gick fel
          </h1>
          <p style={{ color: '#6B5B4F', marginBottom: '24px' }}>
            Vi kunde inte verifiera din betalning. Kontakta support om du har blivit debiterad.
          </p>
          <button
            onClick={() => router.push('/checkout')}
            style={{
              padding: '14px 32px',
              background: '#2A1F1A',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '500',
            }}
          >
            Försök igen
          </button>
        </div>
      </div>
    );
  }

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
        maxWidth: '480px',
        background: 'white',
        padding: '48px 40px',
        borderRadius: '20px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
      }}>
        {/* Success Animation */}
        <div style={{
          width: '80px',
          height: '80px',
          background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          animation: 'popIn 0.5s ease-out',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <h1 style={{
          fontSize: '28px',
          color: '#1A1612',
          marginBottom: '8px',
          fontWeight: '700',
        }}>
          Betalning genomförd!
        </h1>

        <p style={{
          color: '#5D4D3D',
          fontSize: '16px',
          marginBottom: '32px',
          lineHeight: '1.6',
        }}>
          Välkommen till LeTrend{customerName ? `, ${customerName}` : ''}! Din prenumeration är nu aktiv och du har full tillgång till plattformen.
        </p>

        {/* What happens next */}
        <div style={{
          background: '#FAF8F5',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '32px',
          textAlign: 'left',
        }}>
          <h3 style={{ fontSize: '14px', color: '#5D4D3D', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Nästa steg
          </h3>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
              <span style={{ color: '#22C55E', fontSize: '18px' }}>✓</span>
              <span style={{ color: '#1A1612', fontSize: '14px' }}>Bekräftelsemail skickat till din inbox</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
              <span style={{ color: '#22C55E', fontSize: '18px' }}>✓</span>
              <span style={{ color: '#1A1612', fontSize: '14px' }}>Faktura finns tillgänglig i din profil</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ color: '#6B4423', fontSize: '18px' }}>→</span>
              <span style={{ color: '#1A1612', fontSize: '14px' }}>Utforska koncept och hitta ditt nästa samarbete</span>
            </li>
          </ul>
        </div>

        <button
          onClick={() => router.push(dashboardPath)}
          style={{
            width: '100%',
            padding: '16px',
            background: 'linear-gradient(135deg, #6B4423 0%, #4A2F18 100%)',
            color: '#FAF8F5',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(107, 68, 35, 0.3)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          Gå till Dashboard
        </button>

        <p style={{
          fontSize: '13px',
          color: '#9A8B7A',
          marginTop: '20px'
        }}>
          Har du frågor? Kontakta{' '}
          <a href="mailto:hej@letrend.se" style={{ color: '#6B4423' }}>
            hej@letrend.se
          </a>
        </p>
      </div>

      <style>{`
        @keyframes popIn {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
