'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

interface AgreementData {
  status: string;
  customerId: string;
  customerName: string;
  subscriptionId: string;
  invoiceId?: string;
  pricePerMonth: number;
  currency: string;
  productName: string;
  scope?: string | null;
  scopeItems?: string[] | null;
  invoice_text?: string;
  subscription_interval?: string;
  hostedInvoiceUrl?: string;
  currentPeriodEnd?: number;
}

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

export default function AgreementPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AgreementContent />
    </Suspense>
  );
}

function AgreementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [agreement, setAgreement] = useState<AgreementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);

  useEffect(() => {
    const requireAuth = async () => {
      const customerId = searchParams.get('customerId');
      if (customerId) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) return;

      const redirectTarget = `/agreement${window.location.search}`;
      router.replace(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
    };

    void requireAuth();
  }, [router, searchParams]);

  // Auto-check payment status every 3 seconds when accepted
  useEffect(() => {
    if (!accepted || checkingPayment) return;

    const checkPayment = async () => {
      const subscriptionId = localStorage.getItem('agreement_subscription_id');
      if (!subscriptionId) return;

      setCheckingPayment(true);
      try {
        const res = await fetch('/api/stripe/check-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscriptionId }),
        });
        const data = await res.json();

        console.log('Payment check result:', data);

        // Only redirect when invoice is PAID - not trialing or incomplete
        // Check both subscription status AND look for paid invoice
        const subscription = data.subscription;
        
        if (subscription?.status === 'active') {
          // Double-check: get the latest invoice to verify it's paid
          try {
            const invoiceRes = await fetch(`/api/stripe/invoice/${subscriptionId}`, {
              headers: { 'Content-Type': 'application/json' },
            });
            const invoiceData = await invoiceRes.json();
            
            if (invoiceData.invoice?.status === 'paid') {
              // Payment confirmed - redirect to dashboard
              localStorage.removeItem('agreement_accepted');
              localStorage.removeItem('agreement_subscription_id');
              localStorage.removeItem('pending_agreement_email');
              localStorage.removeItem('onboarding_customer_profile_id');
              router.push('/?agreement=completed');
            }
          } catch (e) {
            // If invoice check fails but subscription is active, check if 7 days have passed (timeout)
            const acceptedTime = localStorage.getItem('agreement_accepted_time');
            if (acceptedTime) {
              const minutesSinceAccepted = (Date.now() - parseInt(acceptedTime)) / 1000 / 60;
              if (minutesSinceAccepted > 10) {
                // After 10 minutes, assume paid if subscription is active
                localStorage.removeItem('agreement_accepted');
                localStorage.removeItem('agreement_subscription_id');
                localStorage.removeItem('pending_agreement_email');
                localStorage.removeItem('onboarding_customer_profile_id');
                router.push('/?agreement=completed');
              }
            }
          }
        } else if (subscription?.status === 'past_due') {
          setError('Betalningen misslyckades. Försök igen eller kontakta support.');
          setAccepted(false);
        }
        // If status is 'incomplete', 'trialing', 'past_due' - just wait
      } catch (err) {
        console.error('Error checking payment:', err);
      } finally {
        setCheckingPayment(false);
      }
    };

    // Store the time when user started the payment process
    if (!localStorage.getItem('agreement_accepted_time')) {
      localStorage.setItem('agreement_accepted_time', String(Date.now()));
    }

    const interval = setInterval(checkPayment, 3000);
    return () => clearInterval(interval);
  }, [accepted, checkingPayment, router]);

  useEffect(() => {
    const fetchAgreement = async () => {
      try {
        // Get email from URL params (passed from auth callback)
        const email = searchParams.get('email');
        
        if (!email) {
          // Try to get from localStorage (set by auth callback)
          const storedEmail = localStorage.getItem('pending_agreement_email');
          if (storedEmail) {
            fetchPendingAgreement(storedEmail);
            return;
          }
          setError('Ingen email hittades');
          setLoading(false);
          return;
        }

        await fetchPendingAgreement(email);
      } catch (err) {
        console.error('Error fetching agreement:', err);
        setError('Kunde inte hämta avtal');
        setLoading(false);
      }
    };

    const fetchPendingAgreement = async (email: string) => {
      // First try Stripe
      const res = await fetch(`/api/stripe/pending-agreement?email=${encodeURIComponent(email)}`);
      const data = await res.json();

      if (data.agreement) {
        setAgreement(data.agreement);
        setLoading(false);
        return;
      }

      // Try public agreement
      const customerId = searchParams.get('customerId');
      if (customerId) {
        const publicRes = await fetch(`/api/stripe/public-agreement?customerId=${customerId}`);
        const publicData = await publicRes.json();
        if (publicData.agreement) {
          setAgreement(publicData.agreement);
          setLoading(false);
          return;
        }
      }

      // Fallback: try to get from customer_profiles
      const profileId = localStorage.getItem('onboarding_customer_profile_id');
      if (profileId) {
        try {
          const profileRes = await fetch(`/api/admin/customers/${profileId}`);
          const profileData = await profileRes.json();
          
          if (profileData.profile) {
            const profile = profileData.profile;
            // Create agreement data from customer profile
            if (profile.monthly_price > 0) {
              setAgreement({
                status: 'pending',
                customerId: profile.stripe_customer_id || '',
                customerName: profile.business_name,
                subscriptionId: profile.stripe_subscription_id || '',
                pricePerMonth: profile.monthly_price * 100,
                currency: 'sek',
                productName: 'LeTrend Prenumeration',
                scopeItems: profile.scope_items || [],
                invoice_text: profile.invoice_text,
                subscription_interval: profile.subscription_interval || 'month',
              });
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          console.error('Failed to fetch profile:', e);
        }
      }

      setError('Inget avtal hittades');
      setLoading(false);
    };

    fetchAgreement();
  }, [searchParams]);

  const handleAccept = async () => {
    // Use embedded checkout for a better UX
    if (agreement?.pricePerMonth && agreement?.pricePerMonth > 0) {
      // Store necessary data for checkout page
      localStorage.setItem('pending_agreement_email',
        localStorage.getItem('pending_agreement_email') || agreement.customerId || '');
      localStorage.setItem('onboarding_price', String(agreement.pricePerMonth / 100));
      localStorage.setItem('onboarding_business_name', agreement.customerName);
      if (agreement.scopeItems) {
        localStorage.setItem('onboarding_scope_items', JSON.stringify(agreement.scopeItems));
      }
      if (agreement.invoice_text) {
        localStorage.setItem('onboarding_invoice_text', agreement.invoice_text);
      }
      if (agreement.subscription_interval) {
        localStorage.setItem('onboarding_interval', agreement.subscription_interval);
      }

      // Navigate to embedded checkout
      router.push('/checkout');
      return;
    }

    // Fallback for legacy flow with hosted invoice
    if (agreement?.hostedInvoiceUrl) {
      setAccepting(true);
      try {
        window.open(agreement.hostedInvoiceUrl, '_blank');
        localStorage.setItem('agreement_accepted', 'true');
        localStorage.setItem('agreement_subscription_id', agreement.subscriptionId);
        localStorage.setItem('agreement_accepted_time', String(Date.now()));
        setAccepted(true);
      } catch (err) {
        console.error('Error accepting agreement:', err);
        setError('Kunde inte öppna fakturan');
        setAccepting(false);
      }
      return;
    }

    setError('Ingen faktura tillgänglig just nu. Du kan betala senare från dashboard.');
  };

  const handleCheckPayment = async () => {
    try {
      const subscriptionId = localStorage.getItem('agreement_subscription_id');
      if (!subscriptionId) {
        setError('Ingen prenumeration hittades');
        return;
      }

      setCheckingPayment(true);
      const res = await fetch('/api/stripe/check-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId }),
      });

      const data = await res.json();
      console.log('Manual payment check result:', data);

      // Check if invoice is paid - allow multiple statuses
      const subscription = data.subscription;
      const invoice = data.invoice;
      
      // Payment is confirmed if:
      // 1. Invoice status is 'paid' (most reliable)
      // 2. Subscription is 'active' AND invoice exists with status 'open' (paid but not finalized)
      // 3. Subscription is 'active' (fallback for test mode)
      
      if (invoice?.status === 'paid') {
        // Payment confirmed - save stripe info and redirect to dashboard
        try {
          // Get subscription details to get customer ID
          const subscriptionId = localStorage.getItem('agreement_subscription_id');
          if (subscriptionId) {
            await fetch('/api/admin/profiles/update-stripe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subscriptionId }),
            });
          }
        } catch (e) {
          console.error('Error saving stripe info:', e);
        }
        
        localStorage.removeItem('agreement_accepted');
        localStorage.removeItem('agreement_subscription_id');
        localStorage.removeItem('pending_agreement_email');
        localStorage.removeItem('onboarding_customer_profile_id');
        localStorage.removeItem('agreement_accepted_time');
        router.push('/?agreement=completed');
      } else if (subscription?.status === 'active') {
        // Subscription is active - payment went through
        try {
          const subscriptionId = localStorage.getItem('agreement_subscription_id');
          if (subscriptionId) {
            await fetch('/api/admin/profiles/update-stripe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subscriptionId }),
            });
          }
        } catch (e) {
          console.error('Error saving stripe info:', e);
        }
        
        localStorage.removeItem('agreement_accepted');
        localStorage.removeItem('agreement_subscription_id');
        localStorage.removeItem('pending_agreement_email');
        localStorage.removeItem('onboarding_customer_profile_id');
        localStorage.removeItem('agreement_accepted_time');
        router.push('/?agreement=completed');
      } else if (subscription?.status === 'past_due') {
        setError('Betalningen misslyckades. Försök igen eller kontakta support.');
        setCheckingPayment(false);
      } else if (subscription?.status === 'incomplete') {
        setError('Betalningen är inte slutförd. Gå till fakturan och slutför betalningen.');
        setCheckingPayment(false);
      } else if (invoice?.status === 'open') {
        // Invoice is open - payment might be in progress (Klarna etc)
        setError('Betalningen verkar vara under behandling. Vänta en stund och försök igen.');
        setCheckingPayment(false);
      } else {
        setError('Betalningen har inte registrerats än. Försök igen om en stund.');
        setCheckingPayment(false);
      }
    } catch (err) {
      console.error('Error checking payment:', err);
      setError('Kunde inte verifiera betalning');
      setCheckingPayment(false);
    }
  };

  const handleDecline = async () => {
    // If we have a customer profile ID, update status to pending_payment
    if (agreement?.customerId) {
      try {
        // Try to find and update the customer profile by stripe customer ID
        await fetch('/api/admin/customers/decline-agreement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            stripeCustomerId: agreement.customerId,
            subscriptionId: agreement.subscriptionId 
          }),
        }).catch(e => console.error('Failed to update decline status:', e));
      } catch (e) {
        console.error('Error updating decline status:', e);
      }
    }
    
    localStorage.removeItem('agreement_accepted');
    localStorage.removeItem('agreement_subscription_id');
    localStorage.removeItem('pending_agreement_email');
    
    // Show message that they can pay later from dashboard
    router.push('/?agreement=declined');
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
          <p style={{ color: '#DC2626', marginBottom: '16px' }}>{error}</p>
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

  if (!agreement) {
    return null;
  }

  const price = agreement.pricePerMonth / 100; // Convert from öre
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

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
      padding: '40px 20px',
    }}>
      {/* Back button */}
      <div style={{ maxWidth: '500px', margin: '0 auto 20px' }}>
        <button
          onClick={() => router.push('/onboarding')}
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
          <span>←</span> Tillbaka till paket
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
            <span style={{ color: '#5D4D3D' }}>Företag</span>
            <span style={{ color: '#1A1612', fontWeight: '600' }}>{agreement.customerName}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#5D4D3D' }}>Produkt</span>
            <span style={{ color: '#1A1612', fontWeight: '600' }}>{agreement.productName}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#5D4D3D' }}>Pris per månad</span>
            <span style={{ color: '#1A1612', fontWeight: '600' }}>{priceDisplay}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#5D4D3D' }}>Moms (25%)</span>
            <span style={{ color: '#1A1612', fontWeight: '600' }}>{vatDisplay}</span>
          </div>

          {/* Scope Items */}
          {agreement.scopeItems && agreement.scopeItems.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <span style={{ color: '#5D4D3D', display: 'block', marginBottom: '8px' }}>Vad som ingår:</span>
              <ul style={{ margin: 0, paddingLeft: '16px' }}>
                {agreement.scopeItems.map((item, index) => (
                  <li key={index} style={{ color: '#1A1612', fontSize: '14px', marginBottom: '4px' }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Custom Invoice Text */}
          {agreement.invoice_text && (
            <div style={{ marginBottom: '12px', padding: '12px', background: 'white', borderRadius: '8px' }}>
              <span style={{ color: '#5D4D3D', fontSize: '12px' }}>Avtalstext:</span>
              <p style={{ color: '#1A1612', fontSize: '14px', margin: '4px 0 0' }}>{agreement.invoice_text}</p>
            </div>
          )}

          <div style={{ 
            borderTop: '1px solid #E5E0DA', 
            paddingTop: '12px',
            display: 'flex', 
            justifyContent: 'space-between' 
          }}>
            <span style={{ color: '#1A1612', fontWeight: '600', fontSize: '16px' }}>Att betala</span>
            <span style={{ color: '#6B4423', fontWeight: '700', fontSize: '18px' }}>{totalDisplay}</span>
          </div>
        </div>

        {/* Terms */}
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '12px', color: '#5D4D3D', lineHeight: '1.5' }}>
            Genom att klicka "Gå till betalning" godkänner du våra 
            <a href="/terms" style={{ color: '#6B4423' }}> användarvillkor</a> och 
            <a href="/privacy" style={{ color: '#6B4423' }}> integritetspolicy</a>. 
            Din prenumeration debiteras månadsvis och kan när som helst sägas upp.
          </p>
        </div>

        {/* Actions */}
        {accepted ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#2E7D32', marginBottom: '8px', fontWeight: '600' }}>
              ✅ Fakturan har öppnats i en ny flik
            </p>
            <p style={{ color: '#5D4D3D', fontSize: '14px', marginBottom: '16px' }}>
              {checkingPayment ? 'Kontrollerar betalning...' : 'Vänta på bekräftelse eller klicka nedan'}
            </p>
            <p style={{ color: '#5D4D3D', fontSize: '12px', marginBottom: '16px' }}>
              Vid Klarna eller andra betalningsmetoder: vänta tills du kommer tillbaka till denna sida, eller klicka nedan
            </p>

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
                onClick={handleCheckPayment}
                style={{
                  flex: 2,
                  padding: '14px',
                  background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                  color: '#FAF8F5',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                }}
              >
                Jag har betalat
              </button>
            </div>
          </div>
        ) : (
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
              {accepting ? 'Öppnar...' : 'Gå till betalning'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
