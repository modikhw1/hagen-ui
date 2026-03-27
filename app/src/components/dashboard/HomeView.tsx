'use client';

import { useState } from 'react';
import { display } from '@/lib/display';
import { loadGamePlan, type LinkType } from '@/lib/gameplanLoader';
import {
  BRAND_PROFILE,
  CONCEPTS,
  DEFAULT_LOGGED_IN_PROFILE,
  DEFAULT_USER_CONCEPT_IDS,
  type DemoProfile,
  type UIConcept,
  type Plan,
} from '@/lib/constants/dashboard';

// ============================================
// LINK ICON
// ============================================
function LinkIcon({ type, size = 14 }: { type: LinkType; size?: number }) {
  const style = { width: size, height: size, flexShrink: 0 };

  switch (type) {
    case 'tiktok':
      return (
        <svg style={style} viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
        </svg>
      );
    case 'instagram':
      return (
        <svg style={style} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      );
    case 'youtube':
      return (
        <svg style={style} viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      );
    case 'article':
      return (
        <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <line x1="10" y1="9" x2="8" y2="9"/>
        </svg>
      );
    default:
      return (
        <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
        </svg>
      );
  }
}

// ============================================
// GAME PLAN SECTION
// ============================================
function GamePlanSection({ expanded, onToggle, handle }: { expanded: boolean; onToggle: () => void; handle?: string }) {
  const gamePlan = loadGamePlan(handle);

  return (
    <section style={{ marginTop: '32px' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', color: '#9D8E7D', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          DIN GAMEPLAN
        </div>
        <div style={{ fontSize: '20px', fontWeight: '600', color: '#1A1612' }}>
          Strategi & tips
        </div>
      </div>

      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid rgba(74,47,24,0.08)',
        overflow: 'hidden'
      }}>
        <div
          onClick={onToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            cursor: 'pointer',
            background: expanded ? 'rgba(90,143,90,0.05)' : 'transparent'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#F5F2EE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px'
            }}>
              📋
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#1A1612' }}>
                Din strategi
              </div>
              <div style={{ fontSize: '12px', color: '#9D8E7D' }}>
                {gamePlan.notes.length} anteckningar
              </div>
            </div>
          </div>
          <span style={{
            color: '#9D8E7D',
            fontSize: '12px',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s'
          }}>
            ▼
          </span>
        </div>

        {expanded && (
          <div style={{
            padding: '0 20px 20px',
            borderTop: '1px solid rgba(74,47,24,0.06)'
          }}>
            {gamePlan.notes.map((note, i) => {
              switch (note.type) {
                case 'heading':
                  return (
                    <div key={i} style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#1A1612',
                      marginTop: i === 0 ? '16px' : '20px',
                      marginBottom: '8px'
                    }}>
                      {note.content}
                    </div>
                  );
                case 'text':
                  return (
                    <p key={i} style={{
                      fontSize: '14px',
                      color: '#4A3F35',
                      lineHeight: '1.6',
                      margin: '8px 0'
                    }}>
                      {note.content}
                    </p>
                  );
                case 'link':
                  return (
                    <a
                      key={i}
                      href={note.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        background: '#F5F2EE',
                        borderRadius: '8px',
                        color: '#4A3F35',
                        fontSize: '13px',
                        textDecoration: 'none',
                        margin: '8px 0'
                      }}
                    >
                      <LinkIcon type={note.linkType} /> {note.label}
                    </a>
                  );
                case 'links':
                  return (
                    <div key={i} style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      margin: '12px 0'
                    }}>
                      {note.links.map((link, j) => (
                        <a
                          key={j}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 12px',
                            background: '#F5F2EE',
                            borderRadius: '8px',
                            color: '#4A3F35',
                            fontSize: '12px',
                            textDecoration: 'none'
                          }}
                        >
                          <LinkIcon type={link.linkType} /> {link.label}
                        </a>
                      ))}
                    </div>
                  );
                case 'image':
                  return (
                    <div key={i} style={{ margin: '12px 0' }}>
                      <img
                        src={note.url}
                        alt={note.caption || ''}
                        style={{
                          maxWidth: '100%',
                          borderRadius: '8px'
                        }}
                      />
                      {note.caption && (
                        <div style={{
                          fontSize: '12px',
                          color: '#9D8E7D',
                          marginTop: '6px'
                        }}>
                          {note.caption}
                        </div>
                      )}
                    </div>
                  );
                case 'images':
                  return (
                    <div key={i} style={{
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'wrap',
                      margin: '12px 0'
                    }}>
                      {note.images.map((img, j) => (
                        <div key={j}>
                          <img
                            src={img.url}
                            alt={img.caption || ''}
                            style={{
                              maxWidth: '200px',
                              borderRadius: '8px'
                            }}
                          />
                          {img.caption && (
                            <div style={{
                              fontSize: '11px',
                              color: '#9D8E7D',
                              marginTop: '4px'
                            }}>
                              {img.caption}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                default:
                  return null;
              }
            })}
          </div>
        )}
      </div>
    </section>
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
// HOME VIEW
// ============================================
export function HomeView({
  profileExpanded,
  setProfileExpanded,
  onSelectConcept,
  plan,
  conceptsUsed,
  demoProfile,
  userProfile,
  isMobile
}: {
  profileExpanded: boolean;
  setProfileExpanded: (expanded: boolean) => void;
  onSelectConcept: (concept: UIConcept) => void;
  plan: Plan;
  conceptsUsed: number;
  demoProfile?: DemoProfile;
  userProfile?: {
    business_name?: string;
    social_tiktok?: string | null;
    tone?: string[];
    energy?: string | null;
  };
  isMobile?: boolean;
}) {
  const [gamePlanExpanded, setGamePlanExpanded] = useState(false);

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
  } : userProfile ? {
    ...DEFAULT_LOGGED_IN_PROFILE,
    handle: userProfile.social_tiktok || `@${userProfile.business_name?.toLowerCase().replace(/\s+/g, '') || 'mittforetag'}`,
    avatar: userProfile.business_name?.charAt(0).toUpperCase() || 'M',
    tone: userProfile.tone?.length ? userProfile.tone : DEFAULT_LOGGED_IN_PROFILE.tone,
    energy: userProfile.energy || DEFAULT_LOGGED_IN_PROFILE.energy,
  } : BRAND_PROFILE;

  const displayConcepts = demoProfile
    ? demoProfile.conceptMatches.map(cm => {
        const baseConcept = CONCEPTS.find(c => c.id === cm.id);
        if (!baseConcept) return null;
        return { ...baseConcept, match: cm.match };
      }).filter((c): c is UIConcept => c !== null)
    : userProfile
      ? DEFAULT_USER_CONCEPT_IDS.map(cm => {
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

      {/* Game Plan Section */}
      <GamePlanSection
        expanded={gamePlanExpanded}
        onToggle={() => setGamePlanExpanded(!gamePlanExpanded)}
        handle={activeProfile.handle}
      />
    </main>
  );
}
