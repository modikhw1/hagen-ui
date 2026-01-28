'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { loadConcepts } from '@/lib/conceptLoader';
import { loadLegacyDemoProfiles } from '@/lib/demoProfileLoader';
import { display } from '@/lib/display';
import type { TranslatedConcept } from '@/lib/translator';
import { useVideoSignedUrl } from '@/hooks/useVideoSignedUrl';

// ============================================
// TYPES
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
  videoUrl?: string;
  gcsUri?: string;
}

// ============================================
// DATA LOADERS
// ============================================
const DEMO_PROFILES: DemoProfile[] = loadLegacyDemoProfiles();

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
    description: tc.description_sv || tc.whyItFits_sv?.join('. ') || tc.whyItFits.join('. '),
    whyItWorks: tc.whyItWorks_sv || `${mechDisplay.label} — ${tc.whyItFits[0] || 'Beprövat format'}`,
    productionNotes: tc.productionNotes_sv || tc.whyItFits_sv || tc.whyItFits,
    script: tc.script_sv || `[Manus genereras...]`,
    videoUrl: tc.sourceUrl,
    gcsUri: tc.gcsUri,
  };
}

const translatedConcepts = loadConcepts();
const CONCEPTS: UIConcept[] = translatedConcepts.map(toUIConcept);

// ============================================
// MAIN APP
// ============================================
export default function DemoPage() {
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
          <div style={{ color: '#7D6E5D' }}>Laddar demo...</div>
        </div>
      </div>
    }>
      <DemoPageContent />
    </Suspense>
  );
}

function DemoPageContent() {
  const router = useRouter();

  // Demo login state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // App state
  const [currentView, setCurrentView] = useState<'home' | 'preview' | 'brief'>('home');
  const [selectedConcept, setSelectedConcept] = useState<UIConcept | null>(null);
  const [selectedDemoProfile, setSelectedDemoProfile] = useState<string>('cafe');
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [bottomBarHovered, setBottomBarHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check sessionStorage for existing demo session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedDemo = sessionStorage.getItem('demo-authenticated');
      if (storedDemo === 'true') {
        setIsAuthenticated(true);
      }
    }
  }, []);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (email === 'demo' && password === 'demo') {
      setIsAuthenticated(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('demo-authenticated', 'true');
      }
    } else {
      setError('Ange demo/demo för att logga in');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('demo-authenticated');
    }
  };

  const handleSelectConcept = (concept: UIConcept) => {
    setSelectedConcept(concept);
    setCurrentView('preview');
  };

  const handleUnlock = () => {
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

  // Demo login screen
  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '40px 24px',
        background: 'linear-gradient(180deg, #FAF8F5 0%, #F0EBE4 100%)'
      }}>
        <div style={{ maxWidth: '420px', margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ margin: '0 auto 24px', width: '120px', height: '120px' }}>
              <Image
                src="/transparent.png"
                alt="LeTrend"
                width={120}
                height={120}
                style={{ objectFit: 'contain' }}
              />
            </div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '600',
              color: '#1A1612',
              marginBottom: '8px'
            }}>
              Demo-läge
            </h1>
            <p style={{
              fontSize: '15px',
              color: '#7D6E5D',
              lineHeight: '1.5'
            }}>
              Testa LeTrend med exempeldata
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              padding: '28px',
              boxShadow: '0 4px 24px rgba(44, 36, 22, 0.08)'
            }}>
              {error && (
                <div style={{
                  padding: '14px 16px',
                  background: 'linear-gradient(135deg, #FDF6F3 0%, #FAF0EC 100%)',
                  border: '1px solid rgba(180, 100, 80, 0.2)',
                  borderRadius: '14px',
                  marginBottom: '20px',
                  color: '#8B4D3D',
                  fontSize: '14px',
                }}>
                  {error}
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#5D4D3D',
                  marginBottom: '8px'
                }}>
                  Användarnamn
                </label>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="demo"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(74, 47, 24, 0.15)',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box'
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
                  placeholder="demo"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(74, 47, 24, 0.15)',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <button
                type="submit"
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
                }}
              >
                Öppna demo
              </button>

              <div style={{
                marginTop: '20px',
                textAlign: 'center',
                fontSize: '13px',
                color: '#A89080'
              }}>
                Tips: Använd <strong>demo</strong> / <strong>demo</strong>
              </div>
            </div>
          </form>

          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => router.push('/login')}
              style={{
                padding: '12px 24px',
                background: 'transparent',
                border: '2px solid #E8E0D8',
                borderRadius: '12px',
                color: '#5D4D3D',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              ← Tillbaka till inloggning
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get active demo profile
  const demoProfile = DEMO_PROFILES.find(p => p.id === selectedDemoProfile);

  // Get concepts with custom match percentages for demo profile
  const displayConcepts = demoProfile
    ? demoProfile.conceptMatches.map(cm => {
        const baseConcept = CONCEPTS.find(c => c.id === cm.id);
        if (!baseConcept) return null;
        return { ...baseConcept, match: cm.match };
      }).filter((c): c is UIConcept => c !== null)
    : CONCEPTS;

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
  } : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FAF8F5',
      fontFamily: "'DM Sans', -apple-system, sans-serif"
    }}>
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
            <span style={{
              fontSize: '11px',
              padding: '3px 8px',
              background: 'rgba(107, 68, 35, 0.1)',
              borderRadius: '6px',
              color: '#6B4423',
              fontWeight: '500'
            }}>DEMO</span>
          </div>

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
            Avsluta demo
          </button>
        </div>
      </header>

      {/* Home View */}
      {currentView === 'home' && activeProfile && (
        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: 'clamp(16px, 4vw, 24px) clamp(16px, 4vw, 40px)', paddingBottom: '180px' }}>
          {/* Profile Banner */}
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
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#FAF8F5' }}>
                  {activeProfile.handle}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(250,248,245,0.6)' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'rgba(250,248,245,0.5)', marginBottom: '4px' }}>DIN ENERGI</div>
                    <div style={{ fontSize: '14px', color: '#FAF8F5' }}>{activeProfile.energy}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'rgba(250,248,245,0.5)', marginBottom: '4px' }}>TEAMSTORLEK</div>
                    <div style={{ fontSize: '14px', color: '#FAF8F5' }}>{activeProfile.teamSize}</div>
                  </div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '10px', color: 'rgba(250,248,245,0.5)', marginBottom: '6px' }}>DIN TON</div>
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
              </div>
            )}
          </div>

          {/* Section Title */}
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1A1612', marginBottom: '4px' }}>
              Dina koncept
            </h2>
            <p style={{ fontSize: '14px', color: '#7D6E5D' }}>
              Matchade för {activeProfile.handle}
            </p>
          </div>

          {/* Concept Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px'
          }}>
            {displayConcepts.map(concept => (
              <ConceptCard
                key={concept.id}
                concept={concept}
                onClick={() => handleSelectConcept(concept)}
              />
            ))}
          </div>
        </main>
      )}

      {/* Preview View */}
      {currentView === 'preview' && selectedConcept && (
        <PreviewView
          concept={selectedConcept}
          onUnlock={handleUnlock}
          isMobile={isMobile}
        />
      )}

      {/* Brief View */}
      {currentView === 'brief' && selectedConcept && (
        <BriefView
          concept={selectedConcept}
          isMobile={isMobile}
        />
      )}

      {/* Demo Profile Switcher */}
      {currentView === 'home' && (
        <div
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
    </div>
  );
}

// ============================================
// COMPONENTS
// ============================================

function Logo({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/transparent.png"
      alt="LeTrend"
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
    />
  );
}

function ConceptCard({ concept, onClick }: { concept: UIConcept; onClick: () => void }) {
  const mechDisplay = display.mechanism(concept.mechanism);

  return (
    <div
      onClick={onClick}
      style={{
        padding: '20px',
        background: '#FFFFFF',
        borderRadius: '16px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        border: '1px solid rgba(74, 47, 24, 0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <span style={{ fontSize: '24px' }}>{concept.market}</span>
        <div style={{
          padding: '4px 10px',
          background: concept.match >= 90 ? 'rgba(90, 139, 106, 0.12)' : 'rgba(74, 47, 24, 0.08)',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: '600',
          color: concept.match >= 90 ? '#5A8B6A' : '#4A2F18'
        }}>
          {concept.match}%
        </div>
      </div>

      <h3 style={{
        fontSize: '15px',
        fontWeight: '600',
        color: '#1A1612',
        marginBottom: '8px',
        lineHeight: '1.4'
      }}>
        {concept.title}
      </h3>

      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        background: mechDisplay.color + '15',
        borderRadius: '8px',
        marginBottom: '12px'
      }}>
        <span style={{ fontSize: '12px' }}>{mechDisplay.icon}</span>
        <span style={{ fontSize: '12px', color: '#5D4D3D' }}>{mechDisplay.label}</span>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', color: '#7D6E5D' }}>👥 {concept.teamSize}</span>
        <span style={{ fontSize: '11px', color: '#7D6E5D' }}>⏱ {concept.filmTime}</span>
        <span style={{ fontSize: '11px', color: '#7D6E5D' }}>{concept.difficulty}</span>
      </div>
    </div>
  );
}

function PreviewView({ concept, onUnlock, isMobile }: { concept: UIConcept; onUnlock: () => void; isMobile?: boolean }) {
  const { signedUrl, isLoading: videoLoading } = useVideoSignedUrl({ gcsUri: concept.gcsUri });

  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 40px' }}>
      {/* Video Preview */}
      <div style={{
        aspectRatio: '9/16',
        maxHeight: '500px',
        background: '#1A1612',
        borderRadius: '20px',
        marginBottom: '24px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {videoLoading ? (
          <div style={{ color: '#FAF8F5', fontSize: '14px' }}>Laddar video...</div>
        ) : signedUrl ? (
          <video
            src={signedUrl}
            controls
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#FAF8F5' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎬</div>
            <div style={{ fontSize: '14px', opacity: 0.7 }}>Video ej tillgänglig i demo</div>
          </div>
        )}
      </div>

      {/* Concept Info */}
      <div style={{
        padding: '24px',
        background: '#FFFFFF',
        borderRadius: '20px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <span style={{ fontSize: '28px', marginRight: '12px' }}>{concept.market}</span>
            <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#1A1612', marginTop: '8px' }}>
              {concept.title}
            </h1>
          </div>
          <div style={{
            padding: '8px 16px',
            background: concept.match >= 90 ? 'rgba(90, 139, 106, 0.12)' : 'rgba(74, 47, 24, 0.08)',
            borderRadius: '12px',
            fontSize: '18px',
            fontWeight: '600',
            color: concept.match >= 90 ? '#5A8B6A' : '#4A2F18'
          }}>
            {concept.match}% match
          </div>
        </div>

        <p style={{ fontSize: '15px', color: '#5D4D3D', lineHeight: '1.6', marginBottom: '20px' }}>
          {concept.description}
        </p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <span style={{ padding: '6px 12px', background: '#F0EBE4', borderRadius: '8px', fontSize: '13px', color: '#5D4D3D' }}>
            👥 {concept.teamSize}
          </span>
          <span style={{ padding: '6px 12px', background: '#F0EBE4', borderRadius: '8px', fontSize: '13px', color: '#5D4D3D' }}>
            ⏱ {concept.filmTime}
          </span>
          <span style={{ padding: '6px 12px', background: '#F0EBE4', borderRadius: '8px', fontSize: '13px', color: '#5D4D3D' }}>
            {concept.difficulty}
          </span>
        </div>

        <button
          onClick={onUnlock}
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
          }}
        >
          Lås upp komplett manus →
        </button>
      </div>
    </main>
  );
}

function BriefView({ concept, isMobile }: { concept: UIConcept; isMobile?: boolean }) {
  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 40px' }}>
      <div style={{
        padding: '32px',
        background: '#FFFFFF',
        borderRadius: '20px'
      }}>
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '32px', marginRight: '12px' }}>{concept.market}</span>
          <h1 style={{ fontSize: '28px', fontWeight: '600', color: '#1A1612', marginTop: '8px' }}>
            {concept.title}
          </h1>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1A1612', marginBottom: '12px' }}>
            Varför det funkar
          </h2>
          <p style={{ fontSize: '15px', color: '#5D4D3D', lineHeight: '1.6' }}>
            {concept.whyItWorks}
          </p>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1A1612', marginBottom: '12px' }}>
            Produktionsanteckningar
          </h2>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {concept.productionNotes.map((note, i) => (
              <li key={i} style={{ fontSize: '14px', color: '#5D4D3D', lineHeight: '1.8' }}>
                {note}
              </li>
            ))}
          </ul>
        </div>

        <div style={{
          padding: '24px',
          background: '#F8F6F3',
          borderRadius: '16px'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1A1612', marginBottom: '16px' }}>
            Manus
          </h2>
          <pre style={{
            fontFamily: 'inherit',
            fontSize: '14px',
            color: '#5D4D3D',
            lineHeight: '1.8',
            whiteSpace: 'pre-wrap',
            margin: 0
          }}>
            {concept.script}
          </pre>
        </div>
      </div>
    </main>
  );
}
