'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface OnboardingData {
  businessName: string;
  pricePerMonth: number;
  interval: string;
  scopeItems: string[];
  invoiceText?: string;
  customerProfileId?: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get onboarding data from localStorage (set by auth callback)
    const storedData = localStorage.getItem('onboarding_data');
    
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        setData(parsed);
      } catch (e) {
        console.error('Failed to parse onboarding data:', e);
        setError('Kunde inte läsa inbjudningsdata');
      }
    } else {
      // Try to get from URL params as fallback
      const businessName = localStorage.getItem('onboarding_business_name');
      const price = localStorage.getItem('onboarding_price');
      const interval = localStorage.getItem('onboarding_interval');
      const scopeItems = localStorage.getItem('onboarding_scope_items');
      const customerProfileId = localStorage.getItem('onboarding_customer_profile_id');
      
      // Always fetch from customer profile if we have an ID - ensures we get correct price
      if (customerProfileId) {
        fetchCustomerProfile(customerProfileId);
        return;
      }
      
      // Fallback to localStorage values
      if (businessName && price && parseInt(price) > 0) {
        setData({
          businessName,
          pricePerMonth: parseInt(price) || 0,
          interval: interval || 'month',
          scopeItems: scopeItems ? JSON.parse(scopeItems) : [],
          customerProfileId: customerProfileId || undefined,
        });
      } else {
        setError('Ingen inbjudningsdata hittades');
      }
    }
    setLoading(false);
  }, []);

  const fetchCustomerProfile = async (profileId: string) => {
    try {
      const res = await fetch(`/api/admin/customers/${profileId}`);
      const result = await res.json();
      if (result.profile) {
        setData({
          businessName: result.profile.business_name,
          pricePerMonth: result.profile.monthly_price || 0,
          interval: result.profile.subscription_interval || 'month',
          scopeItems: result.profile.scope_items || [],
          invoiceText: result.profile.invoice_text,
          customerProfileId: profileId,
        });
      } else {
        setError('Kundprofil hittades inte');
      }
    } catch (e) {
      console.error('Failed to fetch customer profile:', e);
      setError('Kunde inte läsa inbjudningsdata');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToPayment = async () => {
    // Ensure all checkout data is in localStorage
    if (data) {
      localStorage.setItem('onboarding_price', String(data.pricePerMonth));
      localStorage.setItem('onboarding_business_name', data.businessName);
      localStorage.setItem('onboarding_interval', data.interval);
      if (data.scopeItems) {
        localStorage.setItem('onboarding_scope_items', JSON.stringify(data.scopeItems));
      }
      if (data.customerProfileId) {
        localStorage.setItem('onboarding_customer_profile_id', data.customerProfileId);
      }
    }

    // Try to fetch actual price from Stripe as fallback
    const email = localStorage.getItem('pending_agreement_email');
    if (email) {
      try {
        const res = await fetch(`/api/stripe/pending-agreement?email=${encodeURIComponent(email)}`);
        const result = await res.json();
        if (result.agreement?.pricePerMonth) {
          localStorage.setItem('onboarding_price', String(result.agreement.pricePerMonth / 100));
          if (result.agreement.scopeItems) {
            localStorage.setItem('onboarding_scope_items', JSON.stringify(result.agreement.scopeItems));
          }
        }
      } catch (e) {
        console.error('Failed to fetch agreement:', e);
      }
    }

    // Go directly to embedded checkout for better UX
    localStorage.setItem('from_onboarding', 'true');
    router.push('/checkout');
  };

  const handleGoToDashboard = () => {
    // Clear onboarding data - user can pay later from dashboard
    localStorage.removeItem('onboarding_data');
    localStorage.removeItem('onboarding_business_name');
    localStorage.removeItem('onboarding_price');
    localStorage.removeItem('onboarding_interval');
    localStorage.removeItem('onboarding_scope_items');
    localStorage.removeItem('onboarding_customer_profile_id');
    localStorage.removeItem('pending_agreement_email');
    router.push('/?onboarding=complete');
  };

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
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error || !data) {
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
          <p style={{ color: '#DC2626', marginBottom: '16px' }}>{error || 'Något gick fel'}</p>
          <button
            onClick={handleGoToDashboard}
            style={{
              padding: '12px 24px',
              background: '#2A1F1A',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Gå till startsidan
          </button>
        </div>
      </div>
    );
  }

  const price = data.pricePerMonth;
  const vat = price * 0.25;
  const total = price + vat;

  const priceDisplay = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
  }).format(price);

  const vatDisplay = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
  }).format(vat);

  const totalDisplay = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
  }).format(total);

  const intervalText = data.interval === 'month' ? 'månad' : data.interval === 'quarter' ? 'kvartal' : 'år';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
      padding: '40px 20px',
    }}>
      {/* Back button */}
      <div style={{ maxWidth: '500px', margin: '0 auto 20px' }}>
        <button
          onClick={() => router.push('/welcome')}
          style={{
            background: 'none',
            border: 'none',
            color: '#5D4D3D',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            padding: '8px 0',
          }}
        >
          <span>←</span> Tillbaka
        </button>
      </div>

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
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #6B4423 0%, #4A2F18 100%)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <span style={{ color: '#FAF8F5', fontSize: '28px', fontWeight: 'bold' }}>Le</span>
          </div>
          <h1 style={{ fontSize: '28px', color: '#1A1612', marginBottom: '8px', fontWeight: '700' }}>
            Välkommen till LeTrend!
          </h1>
          <p style={{ color: '#5D4D3D', fontSize: '16px' }}>
            Här är en sammanfattning av ditt avtal
          </p>
        </div>

        {/* Company Info */}
        <div style={{
          background: '#FAF8F5',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
        }}>
          <h2 style={{ fontSize: '14px', color: '#5D4D3D', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Din prenumeration
          </h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#5D4D3D' }}>Företag</span>
            <span style={{ color: '#1A1612', fontWeight: '600' }}>{data.businessName}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#5D4D3D' }}>Period</span>
            <span style={{ color: '#1A1612', fontWeight: '600' }}>{intervalText}</span>
          </div>

          {/* Scope Items */}
          {data.scopeItems && data.scopeItems.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <span style={{ color: '#5D4D3D', display: 'block', marginBottom: '8px' }}>Vad som ingår:</span>
              <ul style={{ margin: 0, paddingLeft: '16px' }}>
                {data.scopeItems.map((item, index) => (
                  <li key={index} style={{ color: '#1A1612', fontSize: '14px', marginBottom: '4px' }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Custom Invoice Text */}
          {data.invoiceText && (
            <div style={{ marginBottom: '12px', padding: '12px', background: 'white', borderRadius: '8px' }}>
              <span style={{ color: '#5D4D3D', fontSize: '12px' }}>Meddelande:</span>
              <p style={{ color: '#1A1612', fontSize: '14px', margin: '4px 0 0' }}>{data.invoiceText}</p>
            </div>
          )}

          <div style={{ 
            borderTop: '2px solid #E5E0DA', 
            paddingTop: '16px',
            marginTop: '8px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#5D4D3D' }}>Pris</span>
              <span style={{ color: '#1A1612' }}>{priceDisplay}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#5D4D3D' }}>Moms (25%)</span>
              <span style={{ color: '#1A1612' }}>{vatDisplay}</span>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              paddingTop: '8px',
              borderTop: '1px dashed #E5E0DA',
            }}>
              <span style={{ color: '#1A1612', fontWeight: '700', fontSize: '16px' }}>Totalt</span>
              <span style={{ color: '#6B4423', fontWeight: '700', fontSize: '20px' }}>{totalDisplay}</span>
            </div>
          </div>
        </div>

        {/* Note */}
        <div style={{ 
          background: '#FEF3C7', 
          borderRadius: '8px', 
          padding: '12px 16px',
          marginBottom: '24px',
        }}>
          <p style={{ color: '#92400E', fontSize: '13px', margin: 0 }}>
            💡 Du kan betala nu eller när du vill från din dashboard. Din tillgång aktiveras när betalningen är registrerad.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={handleGoToPayment}
            style={{
              width: '100%',
              padding: '16px',
              background: 'linear-gradient(135deg, #6B4423 0%, #4A2F18 100%)',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
            }}
          >
            Gå till betalning
          </button>
          
          <button
            onClick={handleGoToDashboard}
            style={{
              width: '100%',
              padding: '14px',
              background: 'transparent',
              color: '#5D4D3D',
              border: '1px solid #E5E0DA',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Gå till dashboard (betala senare)
          </button>
        </div>
      </div>
    </div>
  );
}
