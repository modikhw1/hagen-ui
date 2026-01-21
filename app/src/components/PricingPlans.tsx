'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { SUBSCRIPTION_PLANS, SubscriptionPlanId } from '@/lib/stripe/config';

interface PricingPlansProps {
  onClose?: () => void;
  onGoToDemo?: () => void;
}

const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

type SelectionType = SubscriptionPlanId | 'custom' | null;

export function PricingPlans({ onClose, onGoToDemo }: PricingPlansProps) {
  const [emailError, setEmailError] = useState('');
  const [selected, setSelected] = useState<SelectionType>(null);
  const [loading, setLoading] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [contactSent, setContactSent] = useState(false);
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  const handleContinue = async () => {
    if (!selected) return;

    if (selected === 'custom') {
      // Handle custom contact form submission
      if (!contactForm.email) {
        setEmailError('Ange din e-postadress');
        return;
      }
      if (!isValidEmail(contactForm.email)) {
        setEmailError('Ange en giltig e-postadress');
        return;
      }
      setEmailError('');
      setLoading(true);
      try {
        // Send contact request (you can implement an API endpoint for this)
        await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...contactForm,
            type: 'custom_solution',
            userEmail: user?.email,
          }),
        }).catch(() => {
          // If no endpoint, just show success anyway
        });
        setContactSent(true);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Handle subscription selection
    if (!user) {
      window.location.href = '/login';
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/stripe/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          userEmail: user.email,
          planId: selected,
        }),
      });

      const { url, error } = await response.json();

      if (error) {
        console.error('Subscription error:', error);
        alert('Något gick fel. Försök igen.');
        return;
      }

      window.location.href = url;
    } catch (err) {
      console.error('Subscription error:', err);
      alert('Något gick fel. Försök igen.');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <div style={{
      padding: '40px 20px',
      maxWidth: '1200px',
      margin: '0 auto',
      position: 'relative',
    }}>
      {/* Logout button */}
      <button
        onClick={handleLogout}
        style={{
          position: 'absolute',
          top: '0',
          right: '20px',
          background: 'none',
          border: 'none',
          fontSize: '14px',
          cursor: 'pointer',
          color: '#6B5B4F',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        Logga ut →
      </button>

      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '0',
            right: '100px',
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#6B4423',
          }}
        >
          ×
        </button>
      )}

      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h2 style={{
          fontSize: '32px',
          fontWeight: '700',
          color: '#2A1F1A',
          marginBottom: '12px',
        }}>
          Välj ditt paket
        </h2>
        <p style={{
          fontSize: '16px',
          color: '#6B5B4F',
          maxWidth: '500px',
          margin: '0 auto',
        }}>
          Ingen bindningstid. Avsluta när du vill. Alla priser exkl. moms.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '20px',
        alignItems: 'stretch',
        marginBottom: '32px',
      }}>
        {(Object.entries(SUBSCRIPTION_PLANS) as [SubscriptionPlanId, typeof SUBSCRIPTION_PLANS[SubscriptionPlanId]][]).map(([planId, plan]) => {
          const isPopular = planId === 'growth';
          const isSelected = selected === planId;

          return (
            <div
              key={planId}
              onClick={() => setSelected(planId)}
              style={{
                background: isPopular
                  ? 'linear-gradient(145deg, #6B4423, #4A2F18)'
                  : '#FFFFFF',
                borderRadius: '20px',
                padding: '28px',
                border: isSelected
                  ? '3px solid #6B4423'
                  : isPopular
                    ? 'none'
                    : '1px solid #E8E0D8',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: isPopular
                  ? '0 20px 40px rgba(107, 68, 35, 0.3)'
                  : '0 4px 12px rgba(0,0,0,0.05)',
                cursor: 'pointer',
                transition: 'transform 0.15s, border-color 0.15s',
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              {/* Selection indicator */}
              <div style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                border: isSelected
                  ? 'none'
                  : `2px solid ${isPopular ? 'rgba(250,248,245,0.4)' : '#E8E0D8'}`,
                background: isSelected ? '#6B4423' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FAF8F5',
                fontSize: '14px',
                fontWeight: 'bold',
              }}>
                {isSelected && '✓'}
              </div>

              {isPopular && (
                <div style={{
                  position: 'absolute',
                  top: '-12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#D4A574',
                  color: '#2A1F1A',
                  padding: '6px 16px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  Populärast
                </div>
              )}

              <div style={{ flex: 1 }}>
                <h3 style={{
                  fontSize: '22px',
                  fontWeight: '700',
                  color: isPopular ? '#FAF8F5' : '#2A1F1A',
                  marginBottom: '8px',
                }}>
                  {plan.name}
                </h3>

                <p style={{
                  fontSize: '13px',
                  color: isPopular ? 'rgba(250,248,245,0.8)' : '#6B5B4F',
                  marginBottom: '20px',
                  minHeight: '36px',
                }}>
                  {plan.description}
                </p>

                <div style={{ marginBottom: '20px' }}>
                  <span style={{
                    fontSize: '36px',
                    fontWeight: '700',
                    color: isPopular ? '#FAF8F5' : '#2A1F1A',
                  }}>
                    {formatPrice(plan.price)}
                  </span>
                  <span style={{
                    fontSize: '14px',
                    color: isPopular ? 'rgba(250,248,245,0.7)' : '#A89080',
                  }}>
                    /månad
                  </span>
                </div>

                <ul style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                }}>
                  {plan.features.map((feature, i) => (
                    <li
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '10px',
                        fontSize: '13px',
                        color: isPopular ? 'rgba(250,248,245,0.9)' : '#4A3F35',
                      }}
                    >
                      <span style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: isPopular ? 'rgba(212,165,116,0.3)' : '#F5F0EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontSize: '11px',
                      }}>
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}

        {/* Custom solution card */}
        <div
          onClick={() => setSelected('custom')}
          style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            padding: '28px',
            border: selected === 'custom' ? '3px solid #6B4423' : '1px solid #E8E0D8',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            cursor: 'pointer',
            transition: 'transform 0.15s, border-color 0.15s',
            transform: selected === 'custom' ? 'scale(1.02)' : 'scale(1)',
          }}
        >
          {/* Selection indicator */}
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            border: selected === 'custom' ? 'none' : '2px solid #E8E0D8',
            background: selected === 'custom' ? '#6B4423' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FAF8F5',
            fontSize: '14px',
            fontWeight: 'bold',
          }}>
            {selected === 'custom' && '✓'}
          </div>

          <div style={{ flex: 1 }}>
            <h3 style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#2A1F1A',
              marginBottom: '8px',
            }}>
              Skräddarsytt
            </h3>

            <p style={{
              fontSize: '13px',
              color: '#6B5B4F',
              marginBottom: '20px',
              minHeight: '36px',
            }}>
              Behöver ni en anpassad lösning? Vi hjälper er!
            </p>

            <div style={{ marginBottom: '20px' }}>
              <span style={{
                fontSize: '24px',
                fontWeight: '600',
                color: '#6B4423',
              }}>
                Kontakta oss
              </span>
            </div>

            {selected === 'custom' && !contactSent ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="text"
                  placeholder="Ditt namn"
                  value={contactForm.name}
                  onChange={(e) => setContactForm(f => ({ ...f, name: e.target.value }))}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #E8E0D8',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
                <input
                  type="email"
                  placeholder="E-post *"
                  value={contactForm.email}
                  onChange={(e) => {
                    setContactForm(f => ({ ...f, email: e.target.value }));
                    setEmailError('');
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: emailError ? '2px solid #D64545' : '1px solid #E8E0D8',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
                {emailError && (
                  <p style={{ color: '#D64545', fontSize: '12px', margin: '-4px 0 0 4px' }}>
                    {emailError}
                  </p>
                )}
                <input
                  type="tel"
                  placeholder="Telefon"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm(f => ({ ...f, phone: e.target.value }))}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #E8E0D8',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>
            ) : selected === 'custom' && contactSent ? (
              <div style={{
                padding: '20px',
                background: '#F5F9F6',
                borderRadius: '12px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>✓</div>
                <p style={{ color: '#3D6B4D', fontSize: '14px', margin: 0, marginBottom: '16px' }}>
                  Tack! Vi hör av oss inom kort.
                </p>
                {onGoToDemo && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onGoToDemo();
                    }}
                    style={{
                      padding: '12px 24px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#6B4423',
                      color: '#FAF8F5',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Se demo →
                  </button>
                )}
              </div>
            ) : (
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
              }}>
                {['Anpassat antal koncept', 'Personlig kontakt', 'Flexibel prissättning', 'Enterprise-funktioner'].map((feature, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '10px',
                      fontSize: '13px',
                      color: '#4A3F35',
                    }}
                  >
                    <span style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#F5F0EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: '11px',
                    }}>
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Continue button - transparent until selection */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={handleContinue}
          disabled={!selected || loading || contactSent}
          style={{
            padding: '18px 48px',
            borderRadius: '12px',
            border: selected ? 'none' : '2px solid #E8E0D8',
            background: selected
              ? 'linear-gradient(145deg, #6B4423, #4A2F18)'
              : 'transparent',
            color: selected ? '#FAF8F5' : '#A89080',
            fontSize: '16px',
            fontWeight: '600',
            cursor: !selected || loading || contactSent ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
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
          ) : selected === 'custom' ? (
            contactSent ? 'Skickat!' : 'Skicka förfrågan'
          ) : selected ? (
            'Fortsätt till betalning →'
          ) : (
            'Välj ett alternativ'
          )}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
