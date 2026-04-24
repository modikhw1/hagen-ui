'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/shared/Logo';
import { PLANS } from '@/lib/constants/dashboard';

function StripeCheckoutStep({
  selectedPlan,
  onBack,
  onComplete,
  onSkip
}: {
  selectedPlan: string;
  onBack: () => void;
  onComplete: () => void;
  onSkip?: () => void;
}) {
  void onComplete;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const plan = PLANS.find(p => p.id === selectedPlan);

  const handleStripeCheckout = async () => {
    if (!user) {
      setError('Du måste vara inloggad för att betala. Använd "Hoppa över betalning" i utvecklingsläge.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          userEmail: user.email,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Något gick fel. Försök igen.');
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 24px' }}>
      <div style={{
        padding: '20px',
        background: '#F5F2EE',
        borderRadius: '14px',
        marginBottom: '24px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#1A1612' }}>
              {plan?.name}
            </div>
            <div style={{ fontSize: '13px', color: '#7D6E5D' }}>
              {plan?.concepts} koncept/månad
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#1A1612' }}>
              {plan?.price} kr
            </div>
            <div style={{ fontSize: '12px', color: '#7D6E5D' }}>
              per månad
            </div>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid rgba(74, 47, 24, 0.1)',
          paddingTop: '16px',
          fontSize: '13px',
          color: '#5D4D3D'
        }}>
          {plan?.features.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ color: '#5A8B6A' }}>✓</span> {f}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div style={{
          padding: '14px 16px',
          background: 'linear-gradient(135deg, #FDF6F3 0%, #FAF0EC 100%)',
          border: '1px solid rgba(180, 100, 80, 0.2)',
          borderRadius: '14px',
          marginBottom: '20px',
          color: '#8B4D3D',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span>⚠</span> {error}
        </div>
      )}

      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>💳</div>
        <div style={{ fontSize: '15px', color: '#1A1612', marginBottom: '8px', fontWeight: '500' }}>
          Säker betalning via Stripe
        </div>
        <div style={{ fontSize: '13px', color: '#7D6E5D', lineHeight: '1.5' }}>
          Du skickas till Stripes säkra betalningssida.<br />
          Kortuppgifter hanteras aldrig av oss.
        </div>
      </div>

      <button
        onClick={handleStripeCheckout}
        disabled={loading}
        style={{
          width: '100%',
          padding: '16px',
          background: loading
            ? '#A89080'
            : 'linear-gradient(145deg, #6B4423, #4A2F18)',
          border: 'none',
          borderRadius: '14px',
          color: '#FAF8F5',
          fontSize: '16px',
          fontWeight: '600',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
      >
        {loading && (
          <span style={{
            width: '16px',
            height: '16px',
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        )}
        {loading ? 'Laddar...' : `Betala ${plan?.price} kr`}
      </button>

      <button
        onClick={onBack}
        style={{
          width: '100%',
          padding: '12px',
          background: 'transparent',
          border: 'none',
          color: '#7D6E5D',
          fontSize: '14px',
          cursor: 'pointer'
        }}
      >
        ← Tillbaka till planer
      </button>

      {onSkip && (
        <button
          onClick={onSkip}
          style={{
            width: '100%',
            padding: '12px',
            marginTop: '24px',
            background: 'transparent',
            border: '1px dashed rgba(74, 47, 24, 0.2)',
            borderRadius: '10px',
            color: '#9D8E7D',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          🛠 Utvecklingsläge: Hoppa över betalning
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

export function PaymentView({
  selectedPlan,
  setSelectedPlan,
  onComplete,
  onSkip
}: {
  selectedPlan: string;
  setSelectedPlan: (plan: string) => void;
  onComplete: () => void;
  onSkip?: () => void;
}) {
  const [step, setStep] = useState<'plan' | 'payment'>('plan');

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FAF8F5',
      paddingBottom: '40px'
    }}>
      <div style={{
        padding: '40px 20px 32px',
        textAlign: 'center',
        borderBottom: '1px solid rgba(74, 47, 24, 0.06)'
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <Logo size={72} />
          <div style={{
            marginTop: '20px',
            fontSize: '12px',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: '#9D8E7D'
          }}>
            {step === 'plan' && 'Steg 1 av 2'}
            {step === 'payment' && 'Steg 2 av 2'}
          </div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: '600',
            color: '#1A1612',
            marginTop: '8px'
          }}>
            {step === 'plan' && 'Välj din plan'}
            {step === 'payment' && 'Betalning'}
          </h1>
        </div>
      </div>

      {step === 'plan' && (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px',
            marginBottom: '32px'
          }}>
            {PLANS.map(plan => (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                style={{
                  padding: '20px',
                  background: selectedPlan === plan.id ? '#4A2F18' : '#FFFFFF',
                  borderRadius: '16px',
                  border: selectedPlan === plan.id
                    ? '2px solid #4A2F18'
                    : '1px solid rgba(74, 47, 24, 0.1)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.15s'
                }}
              >
                {plan.popular && (
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '16px',
                    background: '#8B6914',
                    color: '#FFF',
                    padding: '4px 12px',
                    borderRadius: '10px',
                    fontSize: '10px',
                    fontWeight: '600',
                    textTransform: 'uppercase'
                  }}>
                    Populärast
                  </div>
                )}

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '12px'
                }}>
                  <div>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: '600',
                      color: selectedPlan === plan.id ? '#FAF8F5' : '#1A1612'
                    }}>
                      {plan.name}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: selectedPlan === plan.id ? 'rgba(250,248,245,0.7)' : '#9D8E7D'
                    }}>
                      {plan.concepts} koncept per månad
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '24px',
                      fontWeight: '700',
                      color: selectedPlan === plan.id ? '#FAF8F5' : '#1A1612'
                    }}>
                      {plan.price} kr
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: selectedPlan === plan.id ? 'rgba(250,248,245,0.6)' : '#9D8E7D'
                    }}>
                      /{plan.period}
                    </div>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {plan.features.map((feature, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      color: selectedPlan === plan.id ? 'rgba(250,248,245,0.9)' : '#5D4D3D'
                    }}>
                      <span style={{
                        color: selectedPlan === plan.id ? '#8B6914' : '#5A8F5A'
                      }}>✓</span>
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ maxWidth: '320px', margin: '0 auto' }}>
            <button
              onClick={() => setStep('payment')}
              style={{
                width: '100%',
                padding: '18px',
                background: 'linear-gradient(145deg, #6B4423, #4A2F18)',
                border: 'none',
                borderRadius: '14px',
                color: '#FAF8F5',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Fortsätt
            </button>
          </div>
        </div>
      )}

      {step === 'payment' && (
        <StripeCheckoutStep
          selectedPlan={selectedPlan}
          onBack={() => setStep('plan')}
          onComplete={onComplete}
          onSkip={onSkip}
        />
      )}
    </div>
  );
}
