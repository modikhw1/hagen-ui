'use client'

import { use, useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loadConceptById } from '@/lib/conceptLoader'
import { display } from '@/lib/display'
import { colors, fontFamily, pageContainer, scrollContainer, buttonBase, sectionLabel, primaryButton, tagStyle } from '@/styles/mobile-design'
import { useVideoSignedUrl } from '@/hooks/useVideoSignedUrl'
import { useAuth } from '@/contexts/AuthContext'

interface CustomerConceptData {
  headline_sv?: string | null
  description_sv?: string | null
  why_it_works_sv?: string | null
  script_sv?: string | null
  production_notes_sv?: string[] | null
  why_it_fits_sv?: unknown
  match_percentage?: number
  notes?: string | null
  status?: string
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default function MobileConceptDetail({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'
  const { user } = useAuth()

  const concept = loadConceptById(id)

  const [unlocked, setUnlocked] = useState(false)
  const [tab, setTab] = useState<'manus' | 'checklista' | 'analys'>('manus')
  const [checks, setChecks] = useState<Record<number, boolean>>({})
  const [isPlaying, setIsPlaying] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [videoLink, setVideoLink] = useState('')
  const [linkSubmitted, setLinkSubmitted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Customer-specific overrides fetched from the API
  const [customerConcept, setCustomerConcept] = useState<CustomerConceptData | null>(null)

  useEffect(() => {
    if (!user || isDemo) return
    fetch(`/api/customer/concepts/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.concept) {
          setCustomerConcept(data.concept as CustomerConceptData)
        }
      })
      .catch(err => console.warn('Could not fetch customer concept:', err))
  }, [id, user, isDemo])

  // Use shared hook for video signed URL fetching
  const { signedUrl, isLoading: videoLoading, error: videoError } = useVideoSignedUrl({
    gcsUri: concept?.gcsUri,
    enabled: true
  })

  const handleSubmitLink = () => {
    if (videoLink.trim()) {
      setLinkSubmitted(true)
      setTimeout(() => {
        setShowLinkModal(false)
        setLinkSubmitted(false)
      }, 1500)
    }
  }

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  // Reset playing state when video ends
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      const handleEnded = () => setIsPlaying(false)
      video.addEventListener('ended', handleEnded)
      return () => video.removeEventListener('ended', handleEnded)
    }
  }, [unlocked, signedUrl])

  if (!concept) {
    return (
      <div style={{ ...pageContainer, background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ fontSize: 18, color: colors.text, marginBottom: 16, fontFamily }}>Konceptet hittades inte</p>
          <button
            onClick={() => router.back()}
            style={{ ...buttonBase, background: colors.muted, padding: '12px 24px', borderRadius: 12, color: colors.text, fontFamily }}
          >
            Tillbaka
          </button>
        </div>
      </div>
    )
  }

  // Customer-specific overrides take priority over base concept data
  const headline =
    customerConcept?.headline_sv ?? concept.headline_sv ?? concept.headline
  const description =
    customerConcept?.description_sv ??
    concept.description_sv ??
    'Ett beprövat format som fungerar för din typ av verksamhet.'
  const whyItWorks =
    customerConcept?.why_it_works_sv ??
    concept.whyItWorks_sv ??
    'Konceptet följer beprövade humormekanismer.'
  const script =
    customerConcept?.script_sv ?? concept.script_sv ?? '[Manus genereras...]'
  const productionNotes =
    customerConcept?.production_notes_sv ??
    concept.productionNotes_sv ??
    ['Se originalvideo för referens', 'Anpassa till din miljö']
  const whyItFits = concept.whyItFits_sv ?? ['Beprövat format', 'Anpassningsbart']
  const cmNote = customerConcept?.notes ?? null

  const handleBack = () => {
    const demoParam = isDemo ? '?demo=true' : ''
    router.push(`/m${demoParam}`)
  }

  return (
    <div style={{ ...pageContainer, background: colors.bg }}>
      <div style={scrollContainer}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: colors.card,
          borderBottom: `1px solid ${colors.muted}`,
        }}>
          <button
            onClick={handleBack}
            aria-label="Tillbaka till startsidan"
            style={{ ...buttonBase, display: 'flex', alignItems: 'center', gap: 8, background: 'none', color: colors.text, fontSize: 15, fontWeight: 500, fontFamily }}
          >
            <span aria-hidden="true">←</span>
            <span>LeTrend</span>
          </button>
        </div>

        {!unlocked ? (
          // === PRE-UNLOCK VIEW ===
          <div style={{ padding: 24 }}>
            {/* Video thumbnail */}
            <div style={{
              width: '100%',
              maxWidth: 280,
              margin: '0 auto',
              aspectRatio: '9/16',
              background: colors.dark,
              borderRadius: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              marginBottom: 24,
              overflow: 'hidden',
            }}>
              {signedUrl ? (
                <>
                  <video
                    ref={videoRef}
                    src={signedUrl}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      filter: 'blur(8px) brightness(0.6)',
                    }}
                    muted
                    playsInline
                    loop
                  />
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.3)',
                  }}>
                    <div style={{
                      width: 72,
                      height: 72,
                      background: 'rgba(255,255,255,0.2)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backdropFilter: 'blur(4px)',
                    }}>
                      <span style={{ fontSize: 32, color: '#fff', marginLeft: 4 }}>🔒</span>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ width: 72, height: 72, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 32, color: '#fff', marginLeft: 4 }}>▶</span>
                </div>
              )}
              <span style={{
                position: 'absolute',
                top: 16,
                left: 16,
                background: colors.success,
                color: '#fff',
                padding: '6px 12px',
                borderRadius: 20,
                fontSize: 14,
                fontWeight: 600,
                fontFamily
              }}>
                {concept.matchPercentage}% match
              </span>
            </div>

            {/* Title & tags */}
            <h1 style={{ fontSize: 22, fontWeight: 600, color: colors.text, marginBottom: 12, lineHeight: 1.3, fontFamily }}>{headline}</h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <span style={tagStyle}>{display.mechanism(concept.mechanism).label}</span>
              <span style={tagStyle}>{display.difficulty(concept.difficulty).label}</span>
              <span style={tagStyle}>{display.peopleNeededGrammar(concept.peopleNeeded)}</span>
              <span style={tagStyle}>{display.market(concept.market).flag}</span>
            </div>
            <p style={{ fontSize: 15, color: colors.textMuted, lineHeight: 1.6, marginBottom: 28, fontFamily }}>{description}</p>

            {/* VAD DU FÅR */}
            <div style={{ marginBottom: 28 }}>
              <p style={sectionLabel}>VAD DU FÅR</p>
              {[
                { icon: '🎬', text: 'Original videoreferens' },
                { icon: '📝', text: 'Fullständigt översatt manus' },
                { icon: '✓', text: 'Produktionschecklista' },
                { icon: '💡', text: 'Humor-analys & tips' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < 3 ? `1px solid ${colors.muted}` : 'none' }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <span style={{ fontSize: 15, color: colors.text, fontFamily }}>{item.text}</span>
                </div>
              ))}
            </div>

            {/* VARFÖR DET PASSAR DIG */}
            <div style={{ background: colors.muted, borderRadius: 16, padding: 20, marginBottom: 28 }}>
              <p style={{ ...sectionLabel, marginBottom: 10 }}>VARFÖR DET PASSAR DIG</p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {whyItFits.map((reason, i) => (
                  <li key={i} style={{ fontSize: 15, color: colors.text, lineHeight: 1.6, marginBottom: 4, fontFamily }}>{reason}</li>
                ))}
              </ul>
            </div>

            {/* Unlock CTA */}
            <div style={{ background: colors.muted, borderRadius: 20, padding: 24 }}>
              <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 6, fontFamily }}>Inkluderat i din plan</p>
              <p style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 16, fontFamily }}>Koncept redo att låsas upp</p>
              <button
                onClick={() => setUnlocked(true)}
                style={primaryButton}
              >
                Lås upp koncept
              </button>
            </div>
          </div>
        ) : (
          // === POST-UNLOCK VIEW ===
          <>
            {/* Success banner */}
            <div style={{ background: colors.success, padding: '32px 24px', textAlign: 'center' }}>
              <span style={{ fontSize: 32 }}>✓</span>
              <h2 style={{ fontSize: 22, fontWeight: 600, color: '#fff', marginTop: 12, fontFamily }}>Allt klart</h2>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', marginTop: 8, fontFamily }}>{headline} är redo att filmas</p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', background: colors.card, borderBottom: `1px solid ${colors.muted}` }}>
              {(['Manus', 'Checklista', 'Analys'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t.toLowerCase() as typeof tab)}
                  style={{
                    ...buttonBase,
                    flex: 1,
                    padding: '16px 12px',
                    fontSize: 15,
                    fontWeight: 500,
                    background: 'none',
                    color: tab === t.toLowerCase() ? colors.text : colors.textMuted,
                    borderBottom: tab === t.toLowerCase() ? `2px solid ${colors.primary}` : '2px solid transparent',
                    fontFamily
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            <div style={{ padding: 24 }}>
              {/* CM note - shown when available */}
              {cmNote && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4, fontFamily }}>NOTERING FRÅN CONTENT MANAGER</p>
                  <p style={{ fontSize: 14, color: '#78350f', lineHeight: 1.5, fontFamily }}>{cmNote}</p>
                </div>
              )}

              {/* MANUS TAB */}
              {tab === 'manus' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Video player */}
                  <div
                    onClick={handlePlayPause}
                    style={{
                      width: '100%',
                      maxWidth: 280,
                      margin: '0 auto',
                      aspectRatio: '9/16',
                      background: colors.dark,
                      borderRadius: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: 'pointer',
                    }}
                  >
                    {signedUrl ? (
                      <>
                        <video
                          ref={videoRef}
                          src={signedUrl}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                          }}
                          controls
                          playsInline
                          preload="metadata"
                        />
                        {!isPlaying && (
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(0,0,0,0.3)',
                          }}>
                            <div style={{
                              width: 64,
                              height: 64,
                              background: 'rgba(255,255,255,0.2)',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <span style={{ fontSize: 28, color: '#fff', marginLeft: 4 }}>▶</span>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ width: 64, height: 64, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 28, color: '#fff', marginLeft: 4 }}>▶</span>
                      </div>
                    )}
                  </div>

                  {/* Script */}
                  <div style={{ background: colors.scriptBg, borderRadius: 16, padding: 24 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: colors.textSubtle, marginBottom: 16, letterSpacing: 1, textTransform: 'uppercase', fontFamily }}>Manus — översatt & anpassat</p>
                    <pre style={{
                      fontFamily: '"Courier New", Courier, monospace',
                      fontSize: 14,
                      lineHeight: 1.9,
                      color: '#E8DFD4',
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                    }}>
                      {script}
                    </pre>
                  </div>
                </div>
              )}

              {/* CHECKLISTA TAB */}
              {tab === 'checklista' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div>
                    <p style={sectionLabel}>Produktionschecklista</p>
                    {productionNotes.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => setChecks({ ...checks, [i]: !checks[i] })}
                        style={{
                          ...buttonBase,
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 16,
                          padding: 18,
                          background: colors.muted,
                          borderRadius: 14,
                          marginBottom: 10,
                          textAlign: 'left',
                          opacity: checks[i] ? 0.6 : 1,
                        }}
                      >
                        <div style={{
                          width: 24,
                          height: 24,
                          border: checks[i] ? 'none' : `2px solid ${colors.textSubtle}`,
                          borderRadius: 6,
                          background: checks[i] ? colors.success : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {checks[i] && <span style={{ color: '#fff', fontSize: 14 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 15, color: colors.text, textDecoration: checks[i] ? 'line-through' : 'none', fontFamily }}>{item}</span>
                      </button>
                    ))}
                  </div>

                  <div>
                    <p style={sectionLabel}>Snabbinfo</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ background: colors.muted, borderRadius: 16, padding: 20, textAlign: 'center' }}>
                        <p style={{ fontSize: 20, fontWeight: 600, color: colors.text, marginBottom: 4, fontFamily }}>{display.peopleNeededGrammar(concept.peopleNeeded)}</p>
                        <p style={{ fontSize: 13, color: colors.textMuted, fontFamily }}>Personer behövs</p>
                      </div>
                      <div style={{ background: colors.muted, borderRadius: 16, padding: 20, textAlign: 'center' }}>
                        <p style={{ fontSize: 20, fontWeight: 600, color: colors.text, marginBottom: 4, fontFamily }}>{display.difficulty(concept.difficulty).label}</p>
                        <p style={{ fontSize: 13, color: colors.textMuted, fontFamily }}>Svårighetsgrad</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ANALYS TAB */}
              {tab === 'analys' && (
                <div style={{ background: colors.muted, borderRadius: 16, padding: 24 }}>
                  <p style={{ ...sectionLabel, marginBottom: 14 }}>Varför det funkar</p>
                  <p style={{ fontSize: 15, color: colors.text, lineHeight: 1.7, margin: 0, fontFamily }}>{whyItWorks}</p>
                </div>
              )}

              {/* Link TikTok CTA */}
              <div style={{ background: colors.muted, borderRadius: 20, padding: 24, marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 4, fontFamily }}>Filmat klart?</p>
                  <p style={{ fontSize: 14, color: colors.textMuted, fontFamily }}>Länka din video för att spåra resultat</p>
                </div>
                <button
                  onClick={() => setShowLinkModal(true)}
                  style={{
                    ...buttonBase,
                    padding: '14px 20px',
                    fontSize: 14,
                    fontWeight: 600,
                    background: colors.primary,
                    color: '#fff',
                    borderRadius: 12,
                    whiteSpace: 'nowrap',
                    fontFamily
                  }}
                >
                  Länka TikTok
                </button>
              </div>
            </div>
          </>
        )}
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
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: colors.card,
              borderRadius: '24px 24px 0 0',
              padding: '24px 24px 40px',
              width: '100%',
              maxWidth: 480,
            }}
          >
            {linkSubmitted ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{
                  width: 56,
                  height: 56,
                  background: colors.success,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                  fontSize: 24,
                  color: '#fff'
                }}>✓</div>
                <p style={{ fontSize: 18, fontWeight: 600, color: colors.text, fontFamily }}>
                  Länk sparad!
                </p>
              </div>
            ) : (
              <>
                <div style={{
                  width: 40,
                  height: 4,
                  background: colors.muted,
                  borderRadius: 2,
                  margin: '0 auto 20px'
                }} />

                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <span style={{ fontSize: 32, marginBottom: 8, display: 'block' }}>🔗</span>
                  <h3 style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: colors.text,
                    marginBottom: 6,
                    fontFamily
                  }}>
                    Länka din TikTok-video
                  </h3>
                  <p style={{
                    fontSize: 14,
                    color: colors.textMuted,
                    lineHeight: 1.5,
                    fontFamily
                  }}>
                    Klistra in länken så kan vi spåra resultat och ge dig insikter.
                  </p>
                </div>

                <div style={{
                  padding: 14,
                  background: colors.muted,
                  borderRadius: 14,
                  marginBottom: 16
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: 16 }}>💡</span>
                    <div style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.5, fontFamily }}>
                      <strong style={{ color: colors.text }}>Hur vi använder länken:</strong>
                      <ul style={{ margin: '6px 0 0 0', paddingLeft: 14 }}>
                        <li>Analyserar videons prestation</li>
                        <li>Jämför med originalet</li>
                        <li>Förfinar framtida förslag</li>
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
                    padding: 14,
                    borderRadius: 12,
                    border: `1px solid ${colors.muted}`,
                    fontSize: 15,
                    marginBottom: 16,
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily
                  }}
                />

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setShowLinkModal(false)}
                    style={{
                      ...buttonBase,
                      flex: 1,
                      padding: 14,
                      background: colors.muted,
                      borderRadius: 12,
                      color: colors.text,
                      fontSize: 15,
                      fontWeight: 600,
                      fontFamily
                    }}
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={handleSubmitLink}
                    disabled={!videoLink.trim()}
                    style={{
                      ...buttonBase,
                      flex: 1,
                      padding: 14,
                      background: videoLink.trim() ? colors.primary : colors.muted,
                      borderRadius: 12,
                      color: videoLink.trim() ? '#fff' : colors.textMuted,
                      fontSize: 15,
                      fontWeight: 600,
                      fontFamily,
                      opacity: videoLink.trim() ? 1 : 0.6,
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
    </div>
  )
}
