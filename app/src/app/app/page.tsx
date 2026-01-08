'use client';

import React, { useState } from 'react';
import Image from 'next/image';

// ============================================
// BRAND PROFILE (preset, analyzed from TikTok)
// ============================================
const BRAND_PROFILE = {
  handle: '@mellowcafe',
  avatar: 'M',
  followers: '12,4K',
  avgViews: '8,2K',
  posts: 47,
  tone: ['mysig', 'deadpan', 'relaterbar'],
  energy: 'Varm men torr',
  teamSize: '2-3 personer',
  topMechanisms: ['recognition', 'contrast', 'subversion'] as const,
  recentHits: [
    { title: '"Vi stänger om 5 min"-blicken', views: '24K' },
    { title: 'När stamkunden kommer in', views: '18K' },
  ],
};

// ============================================
// TYPES
// ============================================
interface Concept {
  id: number;
  title: string;
  subtitle: string;
  mechanism: keyof typeof HUMOR_AXES;
  mechanismLabel: string;
  market: string;
  match: number;
  difficulty: string;
  teamSize: string;
  description: string;
  whyItWorks: string;
  productionNotes: string[];
  script: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  period: string;
  concepts: number;
  features: string[];
  popular?: boolean;
}

// ============================================
// CONCEPTS DATA
// ============================================
const CONCEPTS: Concept[] = [
  {
    id: 1,
    title: 'Övertidsleendet',
    subtitle: 'Överdriven positivitet under utmattande pass',
    mechanism: 'contrast',
    mechanismLabel: 'Två Världar Möts',
    market: 'SE',
    match: 94,
    difficulty: 'Lätt',
    teamSize: '1-2',
    description: 'Personal som håller ett aggressivt leende trots uppenbar utmattning. Kontrasten mellan leendet och de döda ögonen säljer skämtet.',
    whyItWorks: 'Humorn kommer från det synliga gapet mellan spelad entusiasm och uppenbar utmattning. Publiken känner igen detta direkt från sina egna serviceupplevelser.',
    productionNotes: [
      'En tagning, inga klipp behövs',
      'Funkar bäst med genuin trötthet (filma i slutet av passet)',
      'Överdriva leendet men håll ögonen neutrala',
      'Ingen dialog krävs - uttrycket bär det',
    ],
    script: `[SCEN: Bakom disken, slutet av passet]

[Anställd ser utmattad ut, axlarna hänger]

[Kund närmar sig]

[OMEDELBAR förvandling - största leendet, glada ögon]

ANSTÄLLD: "Hej! Välkommen till Mellow! Vad får det lov att vara?"

[Håll leendet. Ögonen dör sakta medan grinet hålls]

[Text overlay: "Timme 9 av ett 8-timmars pass"]`,
  },
  {
    id: 2,
    title: 'Stamkunden',
    subtitle: 'Förbereder beställning innan kunden ens pratar',
    mechanism: 'recognition',
    mechanismLabel: 'Smärtsamt Relaterbart',
    market: 'DE',
    match: 92,
    difficulty: 'Lätt',
    teamSize: '2',
    description: 'Personal ser stamkund närma sig och förbereder tyst deras vanliga beställning. Kunden kommer fram, öppnar munnen för att beställa, får drycken i handen.',
    whyItWorks: 'Igenkänningshumor - både stamkunder och personal känner till denna dynamik. Den tysta effektiviteten blir poängen.',
    productionNotes: [
      'Behöver fri sikt till dörren/entrén',
      'Timing är allt - beställningen ska vara klar precis när kunden kommer fram',
      'Kunden ska se lite förvånad men nöjd ut',
      'Kan lägga till text: "När du ser din 08:00 närma sig"',
    ],
    script: `[SCEN: Disk, vy mot entrén]

[Personal märker någon genom fönstret, börjar direkt göra dryck]

[Inga ord, bara självsäker förberedelse]

[Kund kommer in, går till disken, öppnar munnen]

KUND: "Hej, kan jag få—"

[Personal glider över drycken]

PERSONAL: [liten nick]

[Kund accepterar sitt öde, betalar, går]

[Text overlay: "08:47:an"]`,
  },
];

const HUMOR_AXES = {
  contrast: { icon: '⚖️', label: 'Två Världar Möts' },
  recognition: { icon: '😮‍💨', label: 'Smärtsamt Relaterbart' },
  subversion: { icon: '↻', label: 'Twisten' },
  dark: { icon: '🔥', label: 'Mörkt Men Roligt' },
  escalation: { icon: '⚡', label: 'Spiral' },
  deadpan: { icon: '😐', label: 'Torr & Rak' },
};

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 249,
    period: 'mån',
    concepts: 2,
    features: ['2 koncept/månad', 'Fullständiga manus', 'Produktionsguider'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 449,
    period: 'mån',
    concepts: 5,
    features: ['5 koncept/månad', 'Allt i Starter', 'Prioriterad matchning', 'Humor-analys av din profil'],
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 749,
    period: 'mån',
    concepts: 12,
    features: ['12 koncept/månad', 'Allt i Growth', 'Dedikerad support', 'Anpassade koncept'],
  },
];

// ============================================
// MAIN APP
// ============================================
export default function LeTrendApp() {
  const [currentView, setCurrentView] = useState<'login' | 'payment' | 'home' | 'preview' | 'brief'>('login');
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [selectedPlan, setSelectedPlan] = useState('growth');
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [conceptsUsed, setConceptsUsed] = useState(1);

  const handleLogin = () => {
    setCurrentView('payment');
  };

  const handlePayment = () => {
    setCurrentView('home');
  };

  const handleSelectConcept = (concept: Concept) => {
    setSelectedConcept(concept);
    setCurrentView('preview');
  };

  const handleUnlock = () => {
    setConceptsUsed(conceptsUsed + 1);
    setCurrentView('brief');
  };

  const handleBack = () => {
    if (currentView === 'brief') {
      setCurrentView('preview');
    } else if (currentView === 'preview') {
      setCurrentView('home');
      setSelectedConcept(null);
    }
  };

  const plan = PLANS.find(p => p.id === selectedPlan);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FAF8F5',
      fontFamily: "'DM Sans', -apple-system, sans-serif"
    }}>
      {currentView === 'login' && (
        <LoginView onLogin={handleLogin} />
      )}

      {currentView === 'payment' && (
        <PaymentView
          selectedPlan={selectedPlan}
          setSelectedPlan={setSelectedPlan}
          onComplete={handlePayment}
        />
      )}

      {(currentView === 'home' || currentView === 'preview' || currentView === 'brief') && (
        <>
          {/* Header */}
          <header style={{
            borderBottom: '1px solid rgba(74, 47, 24, 0.06)',
            background: '#FAF8F5',
            position: 'sticky',
            top: 0,
            zIndex: 50
          }}>
            <div style={{
              maxWidth: '1200px',
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 40px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {currentView !== 'home' && (
                  <button
                    onClick={handleBack}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '20px',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      marginRight: '4px'
                    }}
                  >
                    ←
                  </button>
                )}
                <Logo size={32} />
                <span style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#1A1612'
                }}>LeTrend</span>
              </div>

              {/* Concepts remaining badge */}
              {currentView === 'home' && plan && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: '#F0EBE4',
                  borderRadius: '20px'
                }}>
                  <span style={{ fontSize: '13px', color: '#5D4D3D' }}>
                    {plan.concepts - conceptsUsed} av {plan.concepts} kvar
                  </span>
                </div>
              )}
            </div>
          </header>
        </>
      )}

      {currentView === 'home' && plan && (
        <HomeView
          profileExpanded={profileExpanded}
          setProfileExpanded={setProfileExpanded}
          onSelectConcept={handleSelectConcept}
          plan={plan}
          conceptsUsed={conceptsUsed}
        />
      )}

      {currentView === 'preview' && selectedConcept && plan && (
        <PreviewView
          concept={selectedConcept}
          onUnlock={handleUnlock}
          plan={plan}
          conceptsUsed={conceptsUsed}
        />
      )}

      {currentView === 'brief' && selectedConcept && (
        <BriefView concept={selectedConcept} />
      )}
    </div>
  );
}

// ============================================
// LOGO COMPONENT
// ============================================
function Logo({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/logo.jpg.jpg"
      alt="LeTrend"
      width={size}
      height={size}
      style={{
        objectFit: 'contain'
      }}
    />
  );
}

// ============================================
// LOGIN VIEW
// ============================================
function LoginView({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '40px 24px',
      background: 'linear-gradient(180deg, #FAF8F5 0%, #F0EBE4 100%)'
    }}>
      <div style={{
        maxWidth: '420px',
        margin: '0 auto',
        width: '100%'
      }}>
        {/* Logo & Title */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ margin: '0 auto 24px', width: '120px', height: '120px' }}>
            <Image
              src="/logo.jpg.jpg"
              alt="LeTrend"
              width={120}
              height={120}
              style={{
                objectFit: 'contain'
              }}
            />
          </div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '600',
            color: '#1A1612',
            marginBottom: '8px'
          }}>
            Välkommen till LeTrend
          </h1>
          <p style={{
            fontSize: '15px',
            color: '#7D6E5D',
            lineHeight: '1.5'
          }}>
            Virala sketchkoncept för ditt varumärke
          </p>
        </div>

        {/* Login Form */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '28px',
          boxShadow: '0 4px 24px rgba(44, 36, 22, 0.08)'
        }}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#5D4D3D',
              marginBottom: '8px'
            }}>
              E-post
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="din@email.se"
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: '12px',
                border: '1px solid rgba(74, 47, 24, 0.15)',
                fontSize: '15px',
                outline: 'none',
                transition: 'border-color 0.15s'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#5D4D3D',
              marginBottom: '8px'
            }}>
              Lösenord
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: '12px',
                border: '1px solid rgba(74, 47, 24, 0.15)',
                fontSize: '15px',
                outline: 'none'
              }}
            />
          </div>

          <button
            onClick={onLogin}
            style={{
              width: '100%',
              padding: '16px',
              background: 'linear-gradient(145deg, #6B4423, #4A2F18)',
              border: 'none',
              borderRadius: '14px',
              color: '#FAF8F5',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '16px'
            }}
          >
            Logga in
          </button>

          <div style={{
            textAlign: 'center'
          }}>
            <button style={{
              background: 'none',
              border: 'none',
              color: '#8B6914',
              fontSize: '14px',
              cursor: 'pointer'
            }}>
              Glömt lösenord?
            </button>
          </div>
        </div>

        {/* Sign up link */}
        <div style={{
          textAlign: 'center',
          marginTop: '24px'
        }}>
          <span style={{ fontSize: '14px', color: '#7D6E5D' }}>
            Inget konto?{' '}
          </span>
          <button style={{
            background: 'none',
            border: 'none',
            color: '#6B4423',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer'
          }}>
            Skapa konto
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// PAYMENT VIEW (First time onboarding)
// ============================================
function PaymentView({
  selectedPlan,
  setSelectedPlan,
  onComplete
}: {
  selectedPlan: string;
  setSelectedPlan: (plan: string) => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<'plan' | 'payment'>('plan');

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FAF8F5',
      paddingBottom: '40px'
    }}>
      {/* Header */}
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
          {/* Plans */}
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
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 24px' }}>
          {/* Selected plan summary */}
          <div style={{
            padding: '16px',
            background: '#F5F2EE',
            borderRadius: '14px',
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: '#1A1612' }}>
                {PLANS.find(p => p.id === selectedPlan)?.name}
              </div>
              <div style={{ fontSize: '13px', color: '#7D6E5D' }}>
                {PLANS.find(p => p.id === selectedPlan)?.concepts} koncept/månad
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#1A1612' }}>
                {PLANS.find(p => p.id === selectedPlan)?.price} kr/mån
              </div>
            </div>
          </div>

          {/* Payment form */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px'
          }}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '500',
                color: '#5D4D3D',
                marginBottom: '8px'
              }}>
                Kortnummer
              </label>
              <input
                type="text"
                placeholder="1234 5678 9012 3456"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(74, 47, 24, 0.15)',
                  fontSize: '15px',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '20px'
            }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#5D4D3D',
                  marginBottom: '8px'
                }}>
                  Utgångsdatum
                </label>
                <input
                  type="text"
                  placeholder="MM/ÅÅ"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(74, 47, 24, 0.15)',
                    fontSize: '15px',
                    outline: 'none'
                  }}
                />
              </div>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#5D4D3D',
                  marginBottom: '8px'
                }}>
                  CVC
                </label>
                <input
                  type="text"
                  placeholder="123"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(74, 47, 24, 0.15)',
                    fontSize: '15px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{
              fontSize: '12px',
              color: '#9D8E7D',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>🔒</span>
              Säker betalning via Stripe
            </div>
          </div>

          <button
            onClick={onComplete}
            style={{
              width: '100%',
              padding: '16px',
              background: 'linear-gradient(145deg, #6B4423, #4A2F18)',
              border: 'none',
              borderRadius: '14px',
              color: '#FAF8F5',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '12px'
            }}
          >
            Starta prenumeration
          </button>

          <button
            onClick={() => setStep('plan')}
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
        </div>
      )}
    </div>
  );
}

// ============================================
// HOME VIEW - Brand anchored recommendations
// ============================================
function HomeView({
  profileExpanded,
  setProfileExpanded,
  onSelectConcept,
  plan,
  conceptsUsed
}: {
  profileExpanded: boolean;
  setProfileExpanded: (expanded: boolean) => void;
  onSelectConcept: (concept: Concept) => void;
  plan: Plan;
  conceptsUsed: number;
}) {
  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 40px 40px' }}>
      {/* Brand Profile Banner */}
      <div style={{
        padding: '20px 24px',
        background: 'linear-gradient(145deg, #4A2F18, #3D2510)',
        borderRadius: '20px',
        marginBottom: '32px'
      }}>
        <div
          onClick={() => setProfileExpanded(!profileExpanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer'
          }}
        >
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'rgba(250,248,245,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FAF8F5',
            fontSize: '20px',
            fontWeight: '600'
          }}>
            {BRAND_PROFILE.avatar}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#FAF8F5'
            }}>
              {BRAND_PROFILE.handle}
            </div>
            <div style={{
              fontSize: '12px',
              color: 'rgba(250,248,245,0.6)'
            }}>
              {BRAND_PROFILE.followers} följare · {BRAND_PROFILE.posts} inlägg analyserade
            </div>
          </div>
          <span style={{
            color: 'rgba(250,248,245,0.5)',
            fontSize: '14px',
            transform: profileExpanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s'
          }}>
            ▼
          </span>
        </div>

        {profileExpanded && (
          <div style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(250,248,245,0.1)'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div>
                <div style={{ fontSize: '10px', color: 'rgba(250,248,245,0.5)', marginBottom: '4px' }}>
                  DIN ENERGI
                </div>
                <div style={{ fontSize: '14px', color: '#FAF8F5' }}>
                  {BRAND_PROFILE.energy}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'rgba(250,248,245,0.5)', marginBottom: '4px' }}>
                  TEAMSTORLEK
                </div>
                <div style={{ fontSize: '14px', color: '#FAF8F5' }}>
                  {BRAND_PROFILE.teamSize}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(250,248,245,0.5)', marginBottom: '6px' }}>
                DIN TON
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {BRAND_PROFILE.tone.map(t => (
                  <span key={t} style={{
                    fontSize: '11px',
                    padding: '4px 10px',
                    background: 'rgba(250,248,245,0.12)',
                    borderRadius: '10px',
                    color: '#FAF8F5'
                  }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(250,248,245,0.5)', marginBottom: '6px' }}>
                FUNKAR FÖR DIG
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {BRAND_PROFILE.topMechanisms.map(m => (
                  <span key={m} style={{
                    fontSize: '11px',
                    padding: '4px 10px',
                    background: 'rgba(90,143,90,0.3)',
                    borderRadius: '10px',
                    color: '#FAF8F5',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {HUMOR_AXES[m]?.icon} {HUMOR_AXES[m]?.label}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: 'rgba(250,248,245,0.5)', marginBottom: '6px' }}>
                DINA SENASTE HITS
              </div>
              {BRAND_PROFILE.recentHits.map((hit, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: 'rgba(250,248,245,0.8)',
                  marginBottom: '4px'
                }}>
                  <span>&quot;{hit.title}&quot;</span>
                  <span style={{ color: 'rgba(250,248,245,0.5)' }}>{hit.views}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section: Best Matches */}
      <section>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <div>
            <div style={{ fontSize: '12px', color: '#9D8E7D', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              BÄSTA MATCHNINGAR
            </div>
            <div style={{ fontSize: '20px', fontWeight: '600', color: '#1A1612' }}>
              För {BRAND_PROFILE.handle}
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '16px'
        }}>
          {CONCEPTS.map(concept => (
            <ConceptCard
              key={concept.id}
              concept={concept}
              onClick={() => onSelectConcept(concept)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

// ============================================
// CONCEPT CARD
// ============================================
function ConceptCard({ concept, onClick }: { concept: Concept; onClick: () => void }) {
  const axis = HUMOR_AXES[concept.mechanism];

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px',
        background: '#FFFFFF',
        borderRadius: '14px',
        border: '1px solid rgba(74,47,24,0.08)',
        cursor: 'pointer',
        transition: 'all 0.15s'
      }}
    >
      {/* Match score */}
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        background: concept.match > 85 ? '#5A8F5A' : '#F0EBE4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: concept.match > 85 ? '#FFF' : '#7D6E5D',
        fontSize: '15px',
        fontWeight: '700',
        flexShrink: 0
      }}>
        {concept.match}%
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '15px',
          fontWeight: '600',
          color: '#1A1612',
          marginBottom: '4px'
        }}>
          {concept.title}
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            background: '#F0EBE4',
            borderRadius: '8px',
            color: '#6B5D4D',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {axis?.icon} {axis?.label}
          </span>
          <span style={{
            fontSize: '11px',
            color: '#9D8E7D'
          }}>
            {concept.market}
          </span>
        </div>
      </div>

      <div style={{
        color: '#9D8E7D',
        fontSize: '18px'
      }}>
        →
      </div>
    </div>
  );
}

// ============================================
// PREVIEW VIEW - Before unlock
// ============================================
function PreviewView({
  concept,
  onUnlock,
  plan,
  conceptsUsed
}: {
  concept: Concept;
  onUnlock: () => void;
  plan: Plan;
  conceptsUsed: number;
}) {
  const axis = HUMOR_AXES[concept.mechanism];
  const conceptsRemaining = plan.concepts - conceptsUsed;

  return (
    <main style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '24px 40px 120px'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(300px, 1.2fr) minmax(300px, 1fr)',
        gap: '40px',
        alignItems: 'start'
      }}>
        {/* Left column - Video & Content */}
        <div>
          {/* Video Preview */}
          <div style={{
            width: '100%',
            paddingBottom: '177%',
            background: 'linear-gradient(145deg, #5D4D3D, #4A3F33)',
            position: 'relative',
            borderRadius: '16px',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'rgba(250,248,245,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FAF8F5',
              fontSize: '28px',
              cursor: 'pointer'
            }}>
              ▶
            </div>

            {/* Match badge */}
            <div style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              background: concept.match > 85 ? '#5A8F5A' : '#4A2F18',
              color: '#FFF',
              padding: '8px 14px',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: '700'
            }}>
              {concept.match}% match
            </div>

            {/* Market badge */}
            <div style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(0,0,0,0.4)',
              color: '#FFF',
              padding: '6px 12px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              {concept.market}
            </div>
          </div>

          {/* Why it works - Teaser */}
          <div style={{
            padding: '20px',
            background: '#F5F2EE',
            borderRadius: '16px',
            marginTop: '20px'
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#9D8E7D',
              marginBottom: '10px',
              textTransform: 'uppercase'
            }}>
              VARFÖR DET FUNKAR
            </div>
            <div style={{
              fontSize: '15px',
              color: '#5D4D3D',
              lineHeight: '1.6'
            }}>
              {concept.whyItWorks}
            </div>
          </div>
        </div>

        {/* Right column - Details */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '28px',
          border: '1px solid rgba(74,47,24,0.08)'
        }}>
          {/* Title & Mechanism */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontSize: '26px',
              fontWeight: '600',
              color: '#1A1612',
              marginBottom: '12px'
            }}>
              {concept.title}
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap'
            }}>
              <span style={{
                fontSize: '13px',
                padding: '6px 12px',
                background: '#F0EBE4',
                borderRadius: '10px',
                color: '#5D4D3D',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {axis?.icon} {axis?.label}
              </span>
              <span style={{
                fontSize: '13px',
                padding: '6px 12px',
                background: '#F0EBE4',
                borderRadius: '10px',
                color: '#5D4D3D'
              }}>
                {concept.difficulty}
              </span>
              <span style={{
                fontSize: '13px',
                padding: '6px 12px',
                background: '#F0EBE4',
                borderRadius: '10px',
                color: '#5D4D3D'
              }}>
                {concept.teamSize} personer
              </span>
            </div>
          </div>

          {/* Description */}
          <div style={{
            fontSize: '15px',
            color: '#5D4D3D',
            lineHeight: '1.7',
            marginBottom: '24px',
            paddingBottom: '24px',
            borderBottom: '1px solid rgba(74,47,24,0.08)'
          }}>
            {concept.description}
          </div>

          {/* What you get */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#9D8E7D',
              marginBottom: '14px',
              textTransform: 'uppercase'
            }}>
              VAD DU FÅR
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { icon: '📹', label: 'Original videoreferens' },
                { icon: '📝', label: 'Fullständigt översatt manus' },
                { icon: '🎯', label: 'Produktionschecklista' },
                { icon: '🧠', label: 'Humor-analys & tips' },
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '15px',
                  color: '#3D3229'
                }}>
                  <span style={{ fontSize: '18px' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Brand fit note */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 16px',
            background: 'rgba(90,143,90,0.1)',
            borderRadius: '12px',
            marginBottom: '24px'
          }}>
            <span style={{ fontSize: '18px' }}>✓</span>
            <span style={{ fontSize: '14px', color: '#3D5A3D' }}>
              Matchar {BRAND_PROFILE.handle}s {BRAND_PROFILE.tone[0]}a ton och {concept.teamSize}-team setup
            </span>
          </div>

          {/* Unlock button */}
          <div style={{
            padding: '20px',
            background: '#F5F2EE',
            borderRadius: '14px'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', color: '#9D8E7D' }}>Inkluderat i din plan</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#1A1612' }}>
                {conceptsRemaining} koncept kvar denna månad
              </div>
            </div>
            <button
              onClick={onUnlock}
              style={{
                width: '100%',
                padding: '18px 28px',
                background: 'linear-gradient(145deg, #5D3A1A, #3D2510)',
                border: 'none',
                borderRadius: '14px',
                color: '#FAF8F5',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Lås upp koncept
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Fixed Unlock Bar - only show on small screens */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#FFFFFF',
        borderTop: '1px solid rgba(74,47,24,0.1)',
        display: 'none' // Hidden on desktop, would use media query in real CSS
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div>
            <div style={{ fontSize: '12px', color: '#9D8E7D' }}>Inkluderat i din plan</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1A1612' }}>
              {conceptsRemaining} koncept kvar denna månad
            </div>
          </div>
          <button
            onClick={onUnlock}
            style={{
              padding: '16px 28px',
              background: 'linear-gradient(145deg, #5D3A1A, #3D2510)',
              border: 'none',
              borderRadius: '14px',
              color: '#FAF8F5',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Lås upp
          </button>
        </div>
      </div>
    </main>
  );
}

// ============================================
// BRIEF VIEW - After unlock (filming companion)
// ============================================
function BriefView({ concept }: { concept: Concept }) {
  const [activeTab, setActiveTab] = useState<'script' | 'checklist' | 'breakdown'>('script');
  const axis = HUMOR_AXES[concept.mechanism];

  return (
    <main style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '0 40px 40px'
    }}>
      {/* Success header */}
      <div style={{
        padding: '32px 40px',
        background: 'linear-gradient(145deg, #5A8F5A, #4A7A4A)',
        textAlign: 'center',
        borderRadius: '0 0 24px 24px',
        marginBottom: '32px'
      }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>✓</div>
        <div style={{ fontSize: '22px', fontWeight: '600', color: '#FFF', marginBottom: '6px' }}>
          Allt klart
        </div>
        <div style={{ fontSize: '16px', color: 'rgba(255,255,255,0.85)' }}>
          {concept.title} är redo att filmas
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid rgba(74,47,24,0.1)',
        background: '#FFF',
        borderRadius: '16px 16px 0 0',
        overflow: 'hidden'
      }}>
        {[
          { id: 'script' as const, label: 'Manus' },
          { id: 'checklist' as const, label: 'Checklista' },
          { id: 'breakdown' as const, label: 'Analys' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '18px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '3px solid #4A2F18' : '3px solid transparent',
              color: activeTab === tab.id ? '#1A1612' : '#9D8E7D',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{
        padding: '32px',
        background: '#FFF',
        borderRadius: '0 0 16px 16px',
        minHeight: '400px'
      }}>
        {activeTab === 'script' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1.2fr)',
            gap: '32px'
          }}>
            {/* Video reference */}
            <div>
              <div style={{
                width: '100%',
                paddingBottom: '177%',
                background: 'linear-gradient(145deg, #5D4D3D, #4A3F33)',
                borderRadius: '16px',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(250,248,245,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FAF8F5',
                  fontSize: '24px',
                  cursor: 'pointer'
                }}>
                  ▶
                </div>
                <div style={{
                  position: 'absolute',
                  bottom: '14px',
                  left: '14px',
                  background: 'rgba(0,0,0,0.6)',
                  color: '#FFF',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}>
                  Original referens
                </div>
              </div>
            </div>

            {/* Script */}
            <div style={{
              padding: '24px',
              background: '#2C2416',
              borderRadius: '16px',
              fontFamily: "'SF Mono', 'Fira Code', monospace"
            }}>
              <div style={{
                fontSize: '12px',
                color: 'rgba(250,248,245,0.5)',
                marginBottom: '20px',
                fontFamily: "'DM Sans', sans-serif",
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                MANUS — Översatt & anpassat
              </div>
              <pre style={{
                fontSize: '14px',
                color: '#FAF8F5',
                lineHeight: '1.8',
                whiteSpace: 'pre-wrap',
                margin: 0
              }}>
                {concept.script || 'Manus ej tillgängligt för detta koncept.'}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'checklist' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr',
            gap: '40px'
          }}>
            <div>
              <div style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#9D8E7D',
                marginBottom: '20px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                PRODUKTIONSCHECKLISTA
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {concept.productionNotes?.map((note, i) => (
                  <label
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '14px',
                      padding: '18px 20px',
                      background: '#F9F7F4',
                      borderRadius: '14px',
                      border: '1px solid rgba(74,47,24,0.06)',
                      cursor: 'pointer',
                      transition: 'background 0.15s'
                    }}
                  >
                    <input
                      type="checkbox"
                      style={{
                        width: '22px',
                        height: '22px',
                        marginTop: '2px',
                        accentColor: '#4A2F18'
                      }}
                    />
                    <span style={{
                      fontSize: '15px',
                      color: '#3D3229',
                      lineHeight: '1.6'
                    }}>
                      {note}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Quick stats */}
            <div>
              <div style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#9D8E7D',
                marginBottom: '20px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                SNABBINFO
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                <div style={{
                  padding: '24px',
                  background: '#F5F2EE',
                  borderRadius: '16px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '32px', fontWeight: '700', color: '#1A1612', marginBottom: '4px' }}>
                    {concept.teamSize}
                  </div>
                  <div style={{ fontSize: '14px', color: '#7D6E5D' }}>Personer behövs</div>
                </div>
                <div style={{
                  padding: '24px',
                  background: '#F5F2EE',
                  borderRadius: '16px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '32px', fontWeight: '700', color: '#1A1612', marginBottom: '4px' }}>
                    {concept.difficulty}
                  </div>
                  <div style={{ fontSize: '14px', color: '#7D6E5D' }}>Svårighetsgrad</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'breakdown' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px'
          }}>
            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Mechanism */}
              <div style={{
                padding: '24px',
                background: '#F9F7F4',
                borderRadius: '16px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px'
                }}>
                  <span style={{ fontSize: '36px' }}>{axis?.icon}</span>
                  <div>
                    <div style={{ fontSize: '12px', color: '#9D8E7D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HUMOR-MEKANISM</div>
                    <div style={{ fontSize: '20px', fontWeight: '600', color: '#1A1612' }}>
                      {axis?.label}
                    </div>
                  </div>
                </div>
              </div>

              {/* Why it works */}
              <div style={{
                padding: '24px',
                background: '#F5F2EE',
                borderRadius: '16px',
                flex: 1
              }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#9D8E7D',
                  marginBottom: '14px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  VARFÖR DET FUNKAR
                </div>
                <div style={{
                  fontSize: '15px',
                  color: '#3D3229',
                  lineHeight: '1.7'
                }}>
                  {concept.whyItWorks}
                </div>
              </div>
            </div>

            {/* Right column - Key moments */}
            <div style={{
              padding: '24px',
              background: '#F9F7F4',
              borderRadius: '16px'
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#9D8E7D',
                marginBottom: '20px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                VIKTIGA MOMENT ATT SPIKA
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[
                  'Setupen — gör den normal och relaterbar',
                  'Kontrast-momentet — här landar humorn',
                  'Håll slutbeatet — låt publiken sitta med det'
                ].map((moment, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '14px'
                  }}>
                    <span style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: '#4A2F18',
                      color: '#FAF8F5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: '600',
                      flexShrink: 0
                    }}>{i + 1}</span>
                    <span style={{ fontSize: '15px', color: '#3D3229', lineHeight: '1.6', paddingTop: '4px' }}>
                      {moment}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Link your video CTA */}
      <div style={{
        marginTop: '32px',
        padding: '28px 40px',
        background: 'linear-gradient(145deg, #F5F2EE, #EDE9E3)',
        borderRadius: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '24px'
      }}>
        <div>
          <div style={{
            fontSize: '18px',
            fontWeight: '600',
            color: '#1A1612',
            marginBottom: '4px'
          }}>
            Filmat klart?
          </div>
          <div style={{
            fontSize: '15px',
            color: '#5D4D3D'
          }}>
            Länka din video för att spåra resultat och få insikter
          </div>
        </div>
        <button style={{
          padding: '16px 32px',
          background: '#4A2F18',
          border: 'none',
          borderRadius: '14px',
          color: '#FAF8F5',
          fontSize: '15px',
          fontWeight: '600',
          cursor: 'pointer',
          whiteSpace: 'nowrap'
        }}>
          Länka min TikTok-video
        </button>
      </div>
    </main>
  );
}
