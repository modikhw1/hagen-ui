'use client';

import React, { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboard } from '@/hooks/useDashboard';
import { Logo } from '@/components/shared/Logo';
import { PaymentView } from '@/components/dashboard/PaymentView';
import { HomeView } from '@/components/dashboard/HomeView';
import { PreviewView } from '@/components/dashboard/PreviewView';
import { BriefView } from '@/components/dashboard/BriefView';
import { PLANS, DEMO_PROFILES } from '@/lib/constants/dashboard';

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

  const {
    isDemoMode, setIsDemoMode,
    currentView, setCurrentView,
    showProfileMenu, setShowProfileMenu,
    selectedConcept, setSelectedConcept,
    selectedPlan, setSelectedPlan,
    profileExpanded, setProfileExpanded,
    conceptsUsed, setConceptsUsed,
    selectedDemoProfile, setSelectedDemoProfile,
    bottomBarHovered, setBottomBarHovered,
    isMobile, setIsMobile,
  } = useDashboard(searchParams.get('demo') === 'true');

  const isAuthMode = searchParams.get('auth') === 'true';

  // Check sessionStorage for demo mode persistence (client-only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedDemo = sessionStorage.getItem('demo-mode');
      if (storedDemo === 'true' && !isDemoMode) {
        setIsDemoMode(true);
      }
    }
  }, [isDemoMode, setIsDemoMode]);

  // Mobile detection with debouncing
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const checkMobile = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsMobile(window.innerWidth <= 768);
      }, 200);
    };

    setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', checkMobile);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', checkMobile);
    };
  }, [setIsMobile]);

  // Auth & payment flow logic
  useEffect(() => {
    const urlDemo = searchParams.get('demo') === 'true';
    const storedDemo = typeof window !== 'undefined' && sessionStorage.getItem('demo-mode') === 'true';

    if (urlDemo || storedDemo) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('demo-mode', 'true');
      }
      setIsDemoMode(true);
      if (currentView === null) {
        setCurrentView('home');
      }
      return;
    }

    const isAuthMode = searchParams.get('auth') === 'true';

    if (isDemoMode) {
      return;
    }

    if (loading) return;

    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success') {
      setCurrentView('home');
      return;
    }

    if (!user && !isAuthMode && !isDemoMode) {
      router.replace('/login');
      return;
    }

    if (currentView === null) {
      setCurrentView('home');
    }
  }, [user, profile, loading, searchParams, router, isDemoMode, currentView, setCurrentView, setIsDemoMode]);

  const handlePayment = () => {
    setCurrentView('home');
  };

  const handleSkipPayment = () => {
    setCurrentView('home');
  };

  const handleLogout = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('demo-mode');
    }

    if (isDemoMode && !user) {
      setIsDemoMode(false);
      router.push('/login');
      return;
    }
    await signOut();
    router.push('/login');
  };

  const handleSelectConcept = (concept: typeof selectedConcept) => {
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

  // Loading screen
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

  // Redirect placeholder
  if (!isDemoMode && !isAuthMode && !user) {
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

  // View loading
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

              {/* User menu */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => isDemoMode ? handleLogout() : setShowProfileMenu(!showProfileMenu)}
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
                  {isDemoMode ? 'Avsluta demo' : (profile?.business_name || 'Profil')}
                </button>

                {showProfileMenu && !isDemoMode && (
                  <>
                    <div
                      onClick={() => setShowProfileMenu(false)}
                      style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 40
                      }}
                    />
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '8px',
                      background: '#FFFFFF',
                      borderRadius: '12px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                      border: '1px solid rgba(74,47,24,0.08)',
                      minWidth: '200px',
                      zIndex: 50,
                      overflow: 'hidden'
                    }}>
                      {[
                        { label: 'Fakturering', onClick: () => { router.push('/billing'); setShowProfileMenu(false); } },
                        { label: 'Inställningar', onClick: () => { setShowProfileMenu(false); } },
                        { label: 'Logga ut', onClick: () => { handleLogout(); setShowProfileMenu(false); }, danger: true }
                      ].map((item, index) => (
                        <button
                          key={item.label}
                          onClick={item.onClick}
                          style={{
                            width: '100%',
                            padding: '14px 18px',
                            background: 'none',
                            border: 'none',
                            borderBottom: index < 2 ? '1px solid rgba(74,47,24,0.06)' : 'none',
                            textAlign: 'left',
                            fontSize: '14px',
                            color: item.danger ? '#C45C5C' : '#1A1612',
                            cursor: 'pointer'
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
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
          userProfile={!isDemoMode && profile ? {
            business_name: profile.business_name,
            social_tiktok: profile.social_links?.tiktok,
            tone: profile.tone || [],
            energy: profile.energy || null,
          } : undefined}
          isMobile={isMobile}
        />
      )}

      {/* Demo Profile Switcher */}
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
            {DEMO_PROFILES.map(demoProfile => (
              <button
                key={demoProfile.id}
                onClick={() => setSelectedDemoProfile(demoProfile.id)}
                style={{
                  padding: '9px 13px',
                  background: selectedDemoProfile === demoProfile.id
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
                <span style={{ fontSize: '15px' }}>{demoProfile.icon}</span>
                <span style={{
                  fontSize: '13px',
                  fontWeight: '500',
                  color: selectedDemoProfile === demoProfile.id ? '#FAF8F5' : '#5D4D3D',
                  whiteSpace: 'nowrap'
                }}>
                  {demoProfile.label}
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
