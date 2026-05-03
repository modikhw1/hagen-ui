'use client';

import { useState } from 'react';
import { display } from '@/lib/display';
import { type UIConcept } from '@/lib/constants/dashboard';
import { VideoPlayer } from '@/components/shared/VideoPlayer';

export function BriefView({ concept, isMobile }: { concept: UIConcept; isMobile?: boolean }) {
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
            <div>
              <VideoPlayer videoUrl={concept.videoUrl} gcsUri={concept.gcsUri} showLabel={true} />
            </div>

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
