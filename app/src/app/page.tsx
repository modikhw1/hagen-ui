'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { loadConcepts } from '@/lib/conceptLoader';
import { loadDefaultProfile } from '@/lib/profileLoader';
import { loadLegacyDemoProfiles } from '@/lib/demoProfileLoader';
import { display, categoryOptions } from '@/lib/display';
import type { TranslatedConcept } from '@/lib/translator';
import { useAuth } from '@/contexts/AuthContext';
import { useVideoSignedUrl } from '@/hooks/useVideoSignedUrl';

// ============================================
// BRAND PROFILE (from translation layer)
// ============================================
const profileData = loadDefaultProfile();
const BRAND_PROFILE = {
  handle: profileData.handle,
  avatar: profileData.avatarInitial,
  followers: profileData.followers,
  avgViews: profileData.avgViews,
  posts: parseInt(profileData.videoCount) || 0,
  tone: profileData.tone,
  energy: profileData.energy,
  teamSize: profileData.teamSize,
  topMechanisms: profileData.topMechanisms as readonly string[],
  recentHits: profileData.recentHits.map(h => ({
    title: h.title,
    views: h.views,
  })),
};

// ============================================
// DEMO PROFILES - Loaded from JSON
// ============================================
interface DemoProfile {
  id: string;
  icon: string;
  label: string;
  handle: string;
  avatar: string;
  followers: string;
  avgViews: string;
  posts: number;
  tone: string[];
  energy: string;
  teamSize: string;
  topMechanisms: readonly string[];
  recentHits: { title: string; views: string }[];
  conceptMatches: { id: string; match: number }[];
}

// Load from demo-profiles.json via translation layer
const DEMO_PROFILES: DemoProfile[] = loadLegacyDemoProfiles();

// ============================================
// TYPES
// ============================================
interface UIConcept {
  id: string;
  title: string;
  subtitle: string;
  mechanism: string;
  market: string;
  match: number;
  difficulty: string;
  teamSize: string;
  filmTime: string;
  description: string;
  whyItWorks: string;
  productionNotes: string[];
  script: string;
  // Video sources
  videoUrl?: string;  // TikTok URL
  gcsUri?: string;    // GCS URI for direct video
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
// CONCEPTS DATA - All from translation layer
// ============================================

// Helper: Convert TranslatedConcept → UIConcept using display layer
function toUIConcept(tc: TranslatedConcept): UIConcept {
  const diffDisplay = display.difficulty(tc.difficulty);
  const peopleDisplay = display.peopleNeeded(tc.peopleNeeded);
  const filmDisplay = display.filmTime(tc.filmTime);
  const marketDisplay = display.market(tc.market);
  const mechDisplay = display.mechanism(tc.mechanism);

  return {
    id: tc.id,
    title: tc.headline_sv || tc.headline,
    subtitle: `${mechDisplay.label}`,
    mechanism: tc.mechanism,
    market: marketDisplay.flag,
    match: tc.matchPercentage,
    difficulty: diffDisplay.label,
    teamSize: peopleDisplay.label,
    filmTime: filmDisplay.label,
    // Use Swedish content fields, fallback to generated
    description: tc.description_sv || tc.whyItFits_sv?.join('. ') || tc.whyItFits.join('. '),
    whyItWorks: tc.whyItWorks_sv || `${mechDisplay.label} — ${tc.whyItFits[0] || 'Beprövat format'}`,
    productionNotes: tc.productionNotes_sv || tc.whyItFits_sv || tc.whyItFits,
    script: tc.script_sv || `[Manus genereras...]`,
    // Video sources
    videoUrl: tc.sourceUrl,
    gcsUri: tc.gcsUri,
  };
}

// Load all concepts from clips.json
const translatedConcepts = loadConcepts();
const CONCEPTS: UIConcept[] = translatedConcepts.map(toUIConcept);

// HUMOR_AXES now comes from display layer
// Usage: display.mechanism('contrast') → { label: 'Två Världar Möts', icon: '⚖️', color: '#...' }

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
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: '#FAF8F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>☕</div>
          <div style={{ color: '#7D6E5D' }}>Laddar...</div>
        </div>
      </div>
    }>
      <LeTrendAppContent />
    </Suspense>
  );
}

function LeTrendAppContent() {
  const { user, profile, loading, signOut } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Check for demo/auth mode - start with URL param only (SSR-safe)
  // sessionStorage is checked in useEffect to avoid hydration mismatch
  const [isDemoMode, setIsDemoMode] = useState(() => {
    return searchParams.get('demo') === 'true';
  });

  const isInitialAuth = searchParams.get('auth') === 'true';

  // Views: payment, home, preview, brief (no login - we redirect instead)
  // Start with null - view is set in useEffect based on auth/demo state
  const [currentView, setCurrentView] = useState<'payment' | 'home' | 'preview' | 'brief' | null>(null);

  // Check sessionStorage for demo mode persistence (client-only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedDemo = sessionStorage.getItem('demo-mode');
      if (storedDemo === 'true' && !isDemoMode) {
        setIsDemoMode(true);
      }
    }
  }, [isDemoMode]);
  const [selectedConcept, setSelectedConcept] = useState<UIConcept | null>(null);
  const [selectedPlan, setSelectedPlan] = useState('growth');
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [conceptsUsed, setConceptsUsed] = useState(1);
  const [selectedDemoProfile, setSelectedDemoProfile] = useState<string>('cafe');
  const [bottomBarHovered, setBottomBarHovered] = useState(false);

  // Mobile detection with SSR-safe initial value
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport with debouncing
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const checkMobile = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsMobile(window.innerWidth <= 768);
      }, 200);
    };

    // Initial check
    setIsMobile(window.innerWidth <= 768);

    window.addEventListener('resize', checkMobile);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Auth & payment flow logic
  useEffect(() => {
    // Check for demo mode from URL or sessionStorage
    const urlDemo = searchParams.get('demo') === 'true';
    const storedDemo = typeof window !== 'undefined' && sessionStorage.getItem('demo-mode') === 'true';

    if (urlDemo || storedDemo) {
      // Save to sessionStorage for persistence
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('demo-mode', 'true');
      }
      setIsDemoMode(true);
      // Only set to home on initial load (when currentView is null)
      // Don't reset if user is navigating (preview, brief)
      if (currentView === null) {
        setCurrentView('home');
      }
      return;
    }

    // Check for auth test mode from URL - show payment view
    const isAuthMode = searchParams.get('auth') === 'true';
    if (isAuthMode && currentView !== 'payment') {
      setCurrentView('payment');
      return;
    }

    // Already in demo mode - don't interfere with navigation
    if (isDemoMode) {
      return;
    }

    if (loading) return;

    // Check for payment status from URL
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success') {
      setCurrentView('home');
      return;
    }

    // Not logged in and not in auth test mode → redirect to login
    if (!user && !isAuthMode && !isDemoMode) {
      router.replace('/login');
      return;
    }

    // Logged in - determine view based on payment status
    const hasPaid = profile?.has_paid;

    // Set view based on payment status
    if (hasPaid) {
      if (currentView !== 'home') {
        setCurrentView('home');
      }
    } else {
      // User is logged in but hasn't paid -> show payment view
      if (currentView !== 'payment') {
        setCurrentView('payment');
      }
    }
  }, [user, profile, loading, searchParams, router, isDemoMode, currentView]);

  const handlePayment = () => {
    setCurrentView('home');
  };

  const handleSkipPayment = () => {
    // Dev mode: skip payment and go to home
    setCurrentView('home');
  };

  const handleLogout = async () => {
    // Clear demo mode from sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('demo-mode');
    }

    if (isDemoMode && !user) {
      // Demo mode - just redirect to login
      setIsDemoMode(false);
      router.push('/login');
      return;
    }
    await signOut();
    router.push('/login');
  };

  const handleSelectConcept = (concept: UIConcept) => {
    console.log('handleSelectConcept called:', concept.id, concept.title);
    setSelectedConcept(concept);
    setCurrentView('preview');
    console.log('Set currentView to preview');
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

  // Check if in auth test mode
  const isAuthMode = searchParams.get('auth') === 'true';

  // Show loading screen while auth is being checked
  if (!isDemoMode && !isAuthMode && loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#FAF8F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>☕</div>
          <div style={{ color: '#7D6E5D' }}>Laddar...</div>
        </div>
      </div>
    );
  }

  // If not logged in, not in demo, and not in auth mode, redirect to login (don't render anything)
  if (!isDemoMode && !isAuthMode && !user) {
    // Redirect happens in useEffect, just show nothing here
    return (
      <div style={{
        minHeight: '100vh',
        background: '#FAF8F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>☕</div>
          <div style={{ color: '#7D6E5D' }}>Omdirigerar...</div>
        </div>
      </div>
    );
  }

  // Show loading while currentView is being determined
  if (currentView === null) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#FAF8F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>☕</div>
          <div style={{ color: '#7D6E5D' }}>Laddar...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FAF8F5',
      fontFamily: "'DM Sans', -apple-system, sans-serif"
    }}>
      {currentView === 'payment' && (
        <PaymentView
          selectedPlan={selectedPlan}
          setSelectedPlan={setSelectedPlan}
          onComplete={handlePayment}
          onSkip={handleSkipPayment}
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

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

                {/* User menu */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={handleLogout}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 14px',
                      background: 'transparent',
                      border: '1px solid rgba(74, 47, 24, 0.1)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#5D4D3D'
                    }}
                  >
                    <span style={{
                      width: '24px',
                      height: '24px',
                      background: '#E8E2D9',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: '#5D4D3D'
                    }}>
                      {profile?.business_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'D'}
                    </span>
                    {isDemoMode ? 'Avsluta demo' : 'Logga ut'}
                  </button>
                </div>
              </div>
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
          demoProfile={isDemoMode ? DEMO_PROFILES.find(p => p.id === selectedDemoProfile) : undefined}
          isMobile={isMobile}
        />
      )}

      {/* Demo Profile Switcher - Only in demo mode on home view */}
      {isDemoMode && currentView === 'home' && (
        <div
          className="demo-profile-switcher"
          onMouseEnter={() => setBottomBarHovered(true)}
          onMouseLeave={() => setBottomBarHovered(false)}
          style={{
            position: 'fixed',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            paddingBottom: 'clamp(12px, 3vw, 24px)',
            opacity: bottomBarHovered ? 1 : 0.6,
            transition: 'opacity 0.2s ease',
            maxWidth: 'calc(100vw - 24px)'
          }}
        >
          <div style={{
            display: 'flex',
            gap: '4px',
            background: '#FFFFFF',
            padding: '7px',
            borderRadius: '13px',
            boxShadow: '0 2px 12px rgba(44, 36, 22, 0.15)'
          }}>
            {DEMO_PROFILES.map(profile => (
              <button
                key={profile.id}
                onClick={() => setSelectedDemoProfile(profile.id)}
                style={{
                  padding: '9px 13px',
                  background: selectedDemoProfile === profile.id
                    ? 'linear-gradient(145deg, #4A2F18, #3D2510)'
                    : 'transparent',
                  border: 'none',
                  borderRadius: '9px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span style={{ fontSize: '15px' }}>{profile.icon}</span>
                <span style={{
                  fontSize: '13px',
                  fontWeight: '500',
                  color: selectedDemoProfile === profile.id ? '#FAF8F5' : '#5D4D3D',
                  whiteSpace: 'nowrap'
                }}>
                  {profile.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {currentView === 'preview' && selectedConcept && plan && (
        <PreviewView
          concept={selectedConcept}
          onUnlock={handleUnlock}
          plan={plan}
          conceptsUsed={conceptsUsed}
          isMobile={isMobile}
        />
      )}

      {currentView === 'brief' && selectedConcept && (
        <BriefView concept={selectedConcept} isMobile={isMobile} />
      )}
    </div>
  );
}

// ============================================
// VIDEO PLAYER COMPONENT
// ============================================
function VideoPlayer({
  videoUrl,
  gcsUri,
  showLabel = true
}: {
  videoUrl?: string;
  gcsUri?: string;
  showLabel?: boolean;
}) {
  // Use shared hook for video signed URL fetching
  const { signedUrl, isLoading: loading, error } = useVideoSignedUrl({
    gcsUri,
    enabled: true
  });

  // Priority 1: GCS signed URL - native video player
  if (signedUrl) {
    return (
      <div
        className="video-container"
        style={{
          width: '100%',
          aspectRatio: '9/16',
          position: 'relative',
          borderRadius: '16px',
          overflow: 'hidden',
          background: '#1A1612'
        }}>
        <video
          src={signedUrl}
          controls
          playsInline
          preload="metadata"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain'
          }}
        />
        {showLabel && (
          <div style={{
            position: 'absolute',
            bottom: '14px',
            left: '14px',
            background: 'rgba(0,0,0,0.6)',
            color: '#FFF',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            zIndex: 10
          }}>
            Original referens
          </div>
        )}
      </div>
    );
  }

  // Priority 2: Loading state for GCS
  if (loading && gcsUri) {
    return (
      <div
        className="video-container"
        style={{
          width: '100%',
          aspectRatio: '9/16',
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
          color: '#FAF8F5',
          fontSize: '14px',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '8px' }}>⏳</div>
          Laddar video...
        </div>
      </div>
    );
  }

  // Priority 3: TikTok embed
  const getTikTokEmbedUrl = (url: string) => {
    const match = url.match(/video\/(\d+)/);
    if (match) {
      return `https://www.tiktok.com/embed/v2/${match[1]}`;
    }
    return null;
  };

  const embedUrl = videoUrl ? getTikTokEmbedUrl(videoUrl) : null;

  if (embedUrl) {
    return (
      <div
        className="video-container"
        style={{
          width: '100%',
          aspectRatio: '9/16',
          position: 'relative',
          borderRadius: '16px',
          overflow: 'hidden',
          background: '#1A1612'
        }}>
        <iframe
          src={embedUrl}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none'
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        {showLabel && (
          <div style={{
            position: 'absolute',
            bottom: '14px',
            left: '14px',
            background: 'rgba(0,0,0,0.6)',
            color: '#FFF',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            zIndex: 10
          }}>
            Original referens
          </div>
        )}
      </div>
    );
  }

  // Fallback: placeholder with TikTok link or error
  return (
    <div
      className="video-container"
      style={{
        width: '100%',
        aspectRatio: '9/16',
        background: 'linear-gradient(145deg, #5D4D3D, #4A3F33)',
        position: 'relative',
        borderRadius: '16px',
        overflow: 'hidden'
      }}>
      {error ? (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#FAF8F5',
          fontSize: '12px',
          textAlign: 'center',
          padding: '0 20px'
        }}>
          {error}
        </div>
      ) : videoUrl ? (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
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
            cursor: 'pointer',
            textDecoration: 'none'
          }}
        >
          ▶
        </a>
      ) : (
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
          fontSize: '28px'
        }}>
          ▶
        </div>
      )}
      {showLabel && (
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
          {error ? 'Video ej tillgänglig' : videoUrl ? 'Öppna på TikTok' : 'Video ej tillgänglig'}
        </div>
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
      src="/transparent.png"
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
              src="/transparent.png"
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
// ============================================
// STRIPE CHECKOUT STEP
// ============================================
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const plan = PLANS.find(p => p.id === selectedPlan);

  const handleStripeCheckout = async () => {
    if (!user) {
      // In auth test mode, show error instead of redirecting
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

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Något gick fel. Försök igen.');
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 24px' }}>
      {/* Selected plan summary */}
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

      {/* Stripe info */}
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

      {/* Dev mode: Skip payment */}
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

function PaymentView({
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

// ============================================
// DEMO PROFILE VIEW - Reusable component for profile + clips
// ============================================
interface ProfileViewData {
  profile: {
    handle: string;
    avatar: string;
    followers: string;
    avgViews: string;
    posts: number;
    tone: string[];
    energy: string;
    teamSize: string;
    topMechanisms: readonly string[];
    recentHits: { title: string; views: string }[];
  };
  concepts: UIConcept[]; // 0-4 clips
}

function ProfileConceptsView({
  data,
  onSelectConcept,
  expanded,
  onToggleExpand
}: {
  data: ProfileViewData;
  onSelectConcept: (concept: UIConcept) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const { profile, concepts } = data;

  return (
    <div>
      {/* Brand Profile Banner */}
      <div style={{
        padding: '16px 20px',
        background: 'linear-gradient(145deg, #4A2F18, #3D2510)',
        borderRadius: '16px',
        marginBottom: '24px'
      }}>
        <div
          onClick={onToggleExpand}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer'
          }}
        >
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'rgba(250,248,245,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FAF8F5',
            fontSize: '16px',
            fontWeight: '600'
          }}>
            {profile.avatar}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#FAF8F5' }}>
              {profile.handle}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(250,248,245,0.6)' }}>
              {profile.followers} följare · {profile.posts} inlägg
            </div>
          </div>
          <span style={{
            color: 'rgba(250,248,245,0.5)',
            fontSize: '12px',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s'
          }}>▼</span>
        </div>

        {expanded && (
          <div style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(250,248,245,0.1)'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '9px', color: 'rgba(250,248,245,0.5)', marginBottom: '2px' }}>ENERGI</div>
                <div style={{ fontSize: '12px', color: '#FAF8F5' }}>{profile.energy}</div>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: 'rgba(250,248,245,0.5)', marginBottom: '2px' }}>TEAM</div>
                <div style={{ fontSize: '12px', color: '#FAF8F5' }}>{profile.teamSize}</div>
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '9px', color: 'rgba(250,248,245,0.5)', marginBottom: '4px' }}>TON</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {profile.tone.map(t => (
                  <span key={t} style={{
                    fontSize: '10px',
                    padding: '3px 8px',
                    background: 'rgba(250,248,245,0.12)',
                    borderRadius: '8px',
                    color: '#FAF8F5'
                  }}>{t}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '9px', color: 'rgba(250,248,245,0.5)', marginBottom: '4px' }}>MEKANISMER</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {profile.topMechanisms.map(m => {
                  const mech = display.mechanism(m);
                  return (
                    <span key={m} style={{
                      fontSize: '10px',
                      padding: '3px 8px',
                      background: 'rgba(90,143,90,0.3)',
                      borderRadius: '8px',
                      color: '#FAF8F5'
                    }}>{mech.icon} {mech.label}</span>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Concepts Grid */}
      {concepts.length === 0 ? (
        <div style={{
          padding: '40px 20px',
          background: '#F5F2EE',
          borderRadius: '16px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.5 }}>📭</div>
          <div style={{ fontSize: '15px', color: '#7D6E5D', fontWeight: '500' }}>Inga koncept än</div>
          <div style={{ fontSize: '13px', color: '#9D8E7D', marginTop: '4px' }}>
            Koncept läggs till baserat på din profil
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: concepts.length <= 2 ? '1fr' : 'repeat(2, 1fr)',
          gap: '12px'
        }}>
          {concepts.map(concept => (
            <ConceptCard
              key={concept.id}
              concept={concept}
              onClick={() => onSelectConcept(concept)}
            />
          ))}
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
  conceptsUsed,
  demoProfile,
  isMobile
}: {
  profileExpanded: boolean;
  setProfileExpanded: (expanded: boolean) => void;
  onSelectConcept: (concept: UIConcept) => void;
  plan: Plan;
  conceptsUsed: number;
  demoProfile?: DemoProfile;
  isMobile?: boolean;
}) {
  // Use demo profile if provided, otherwise default brand profile
  const activeProfile = demoProfile ? {
    handle: demoProfile.handle,
    avatar: demoProfile.avatar,
    followers: demoProfile.followers,
    avgViews: demoProfile.avgViews,
    posts: demoProfile.posts,
    tone: demoProfile.tone,
    energy: demoProfile.energy,
    teamSize: demoProfile.teamSize,
    topMechanisms: demoProfile.topMechanisms,
    recentHits: demoProfile.recentHits,
  } : BRAND_PROFILE;

  // Get concepts with custom match percentages for demo profile
  const displayConcepts = demoProfile
    ? demoProfile.conceptMatches.map(cm => {
        const baseConcept = CONCEPTS.find(c => c.id === cm.id);
        if (!baseConcept) return null;
        return { ...baseConcept, match: cm.match };
      }).filter((c): c is UIConcept => c !== null)
    : CONCEPTS;

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: 'clamp(16px, 4vw, 24px) clamp(16px, 4vw, 40px) clamp(16px, 4vw, 40px)', paddingBottom: demoProfile ? '180px' : '40px' }}>
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
            {activeProfile.avatar}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#FAF8F5'
            }}>
              {activeProfile.handle}
            </div>
            <div style={{
              fontSize: '12px',
              color: 'rgba(250,248,245,0.6)'
            }}>
              {activeProfile.followers} följare · {activeProfile.posts} inlägg analyserade
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
                  {activeProfile.energy}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'rgba(250,248,245,0.5)', marginBottom: '4px' }}>
                  TEAMSTORLEK
                </div>
                <div style={{ fontSize: '14px', color: '#FAF8F5' }}>
                  {activeProfile.teamSize}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(250,248,245,0.5)', marginBottom: '6px' }}>
                DIN TON
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {activeProfile.tone.map(t => (
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
                {activeProfile.topMechanisms.map(m => {
                  const mech = display.mechanism(m);
                  return (
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
                      {mech.icon} {mech.label}
                    </span>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: 'rgba(250,248,245,0.5)', marginBottom: '6px' }}>
                DINA SENASTE HITS
              </div>
              {activeProfile.recentHits.map((hit, i) => (
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
              För {activeProfile.handle}
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
          gap: '16px'
        }}>
          {displayConcepts.map(concept => (
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
function ConceptCard({ concept, onClick }: { concept: UIConcept; onClick: () => void }) {
  const axis = display.mechanism(concept.mechanism);

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
  conceptsUsed,
  isMobile
}: {
  concept: UIConcept;
  onUnlock: () => void;
  plan: Plan;
  conceptsUsed: number;
  isMobile?: boolean;
}) {
  const axis = display.mechanism(concept.mechanism);
  const conceptsRemaining = plan.concepts - conceptsUsed;

  return (
    <main style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: isMobile ? '16px 16px 120px' : 'clamp(16px, 4vw, 24px) clamp(16px, 4vw, 40px) 120px'
    }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(240px, 300px) 1fr',
          gap: isMobile ? '20px' : 'clamp(20px, 4vw, 40px)',
          alignItems: 'start'
        }}>
        {/* Left column - Video & Content */}
        <div style={{ maxWidth: isMobile ? '100%' : 300 }}>
          {/* Video Preview */}
          <div style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden' }}>
            <VideoPlayer videoUrl={concept.videoUrl} gcsUri={concept.gcsUri} showLabel={false} />

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
              fontWeight: '700',
              zIndex: 10
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
              fontWeight: '600',
              zIndex: 10
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
                {concept.teamSize}
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
      <div
        className="mobile-unlock-bar"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#FFFFFF',
          borderTop: '1px solid rgba(74,47,24,0.1)',
          display: 'none' // Overridden by CSS class on mobile
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
function BriefView({ concept, isMobile }: { concept: UIConcept; isMobile?: boolean }) {
  const [activeTab, setActiveTab] = useState<'script' | 'checklist' | 'breakdown'>('script');
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [videoLink, setVideoLink] = useState('');
  const [linkSubmitted, setLinkSubmitted] = useState(false);
  const axis = display.mechanism(concept.mechanism);

  const handleSubmitLink = () => {
    if (videoLink.trim()) {
      setLinkSubmitted(true);
      setTimeout(() => {
        setShowLinkModal(false);
        setLinkSubmitted(false);
      }, 1500);
    }
  };

  return (
    <main style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: isMobile ? '0 16px 40px' : '0 clamp(16px, 4vw, 40px) 40px'
    }}>
      {/* Success header */}
      <div style={{
        padding: 'clamp(20px, 4vw, 32px) clamp(20px, 4vw, 40px)',
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
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid rgba(74,47,24,0.1)',
          background: '#FFF',
          borderRadius: isMobile ? '12px 12px 0 0' : '16px 16px 0 0',
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
              padding: isMobile ? '14px 12px' : '18px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '3px solid #4A2F18' : '3px solid transparent',
              color: activeTab === tab.id ? '#1A1612' : '#9D8E7D',
              fontSize: isMobile ? '14px' : '15px',
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
              gap: isMobile ? '20px' : 'clamp(16px, 4vw, 32px)'
            }}>
            {/* Video reference */}
            <div>
              <VideoPlayer videoUrl={concept.videoUrl} gcsUri={concept.gcsUri} showLabel={true} />
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
              gap: isMobile ? '20px' : 'clamp(20px, 4vw, 40px)'
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
              gap: isMobile ? '20px' : 'clamp(16px, 4vw, 24px)'
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
      <div
        style={{
          marginTop: '32px',
          padding: isMobile ? '20px' : '28px 40px',
          background: 'linear-gradient(145deg, #F5F2EE, #EDE9E3)',
          borderRadius: '20px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          gap: isMobile ? '16px' : '24px'
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
        <button
          onClick={() => setShowLinkModal(true)}
          style={{
            padding: '16px 32px',
            background: '#4A2F18',
            border: 'none',
            borderRadius: '14px',
            color: '#FAF8F5',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            width: isMobile ? '100%' : 'auto'
          }}
        >
          Länka min TikTok-video
        </button>
      </div>

      {/* Link Video Modal */}
      {showLinkModal && (
        <div
          onClick={() => setShowLinkModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26, 22, 18, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              padding: '32px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 60px rgba(44, 36, 22, 0.25)'
            }}
          >
            {linkSubmitted ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  background: '#5A8F5A',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  fontSize: '28px',
                  color: '#FFF'
                }}>✓</div>
                <div style={{ fontSize: '20px', fontWeight: '600', color: '#1A1612' }}>
                  Länk sparad!
                </div>
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔗</div>
                  <h3 style={{
                    fontSize: '22px',
                    fontWeight: '600',
                    color: '#1A1612',
                    marginBottom: '8px'
                  }}>
                    Länka din TikTok-video
                  </h3>
                  <p style={{
                    fontSize: '15px',
                    color: '#7D6E5D',
                    lineHeight: '1.6'
                  }}>
                    Klistra in länken till din publicerade video så kan vi spåra resultat och ge dig insikter.
                  </p>
                </div>

                <div style={{
                  padding: '16px',
                  background: 'rgba(139, 105, 20, 0.08)',
                  borderRadius: '14px',
                  marginBottom: '20px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px'
                  }}>
                    <span style={{ fontSize: '18px' }}>💡</span>
                    <div style={{ fontSize: '14px', color: '#5D4D3D', lineHeight: '1.5' }}>
                      <strong>Hur vi använder länken:</strong>
                      <ul style={{ margin: '8px 0 0 0', paddingLeft: '16px' }}>
                        <li>Analyserar videons prestation</li>
                        <li>Jämför med originalet för insikter</li>
                        <li>Förfinar framtida konceptförslag</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <input
                  type="url"
                  value={videoLink}
                  onChange={(e) => setVideoLink(e.target.value)}
                  placeholder="https://www.tiktok.com/@ditt-konto/video/..."
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '14px',
                    border: '1px solid rgba(74, 47, 24, 0.15)',
                    fontSize: '15px',
                    marginBottom: '20px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => setShowLinkModal(false)}
                    style={{
                      flex: 1,
                      padding: '16px',
                      background: '#F0EBE4',
                      border: 'none',
                      borderRadius: '14px',
                      color: '#5D4D3D',
                      fontSize: '15px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={handleSubmitLink}
                    disabled={!videoLink.trim()}
                    style={{
                      flex: 1,
                      padding: '16px',
                      background: videoLink.trim() ? 'linear-gradient(145deg, #5D3A1A, #3D2510)' : '#D0C8BE',
                      border: 'none',
                      borderRadius: '14px',
                      color: '#FAF8F5',
                      fontSize: '15px',
                      fontWeight: '600',
                      cursor: videoLink.trim() ? 'pointer' : 'not-allowed'
                    }}
                  >
                    Spara länk
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
