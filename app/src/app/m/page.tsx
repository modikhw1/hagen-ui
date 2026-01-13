'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'
import { loadConcepts, loadConceptById } from '@/lib/conceptLoader'
import { display } from '@/lib/display'
import type { TranslatedConcept } from '@/lib/translator'
import { colors, fontFamily, pageContainer, scrollContainer, buttonBase, headerStyle, sectionLabel, tagStyle } from '@/styles/mobile-design'
import demoProfiles from '@/data/demo-profiles.json'

interface DemoProfile {
  id: string
  icon: string
  label: string
  profile: {
    handle: string
    avatar: string
    followers: string
    avgViews: string
    posts: number
    tone: string[]
    energy: string
    teamSize: string
    topMechanisms: string[]
    recentHits: { title: string; views: string }[]
  }
  concepts: { clipId: string; matchOverride?: number }[]
}

function CategoryPicker({
  categories,
  selectedIndex,
  onSelect,
  onClose
}: {
  categories: DemoProfile[]
  selectedIndex: number
  onSelect: (index: number) => void
  onClose: () => void
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26, 22, 18, 0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 100
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: colors.card,
          borderRadius: '24px 24px 0 0',
          padding: '20px 24px 36px'
        }}
      >
        <div style={{
          width: 40,
          height: 4,
          background: colors.muted,
          borderRadius: 2,
          margin: '0 auto 20px'
        }} />
        <h3 style={{
          fontSize: 18,
          fontWeight: 600,
          color: colors.text,
          marginBottom: 16,
          fontFamily
        }}>
          Välj kategori
        </h3>
        {categories.map((c, i) => (
          <button
            key={i}
            onClick={() => { onSelect(i); onClose() }}
            style={{
              ...buttonBase,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: 16,
              background: i === selectedIndex ? colors.muted : 'transparent',
              borderRadius: 14,
              textAlign: 'left',
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 24 }}>{c.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: colors.text, fontFamily }}>{c.label}</div>
              <div style={{ fontSize: 14, color: colors.textMuted, fontFamily }}>{c.profile.handle}</div>
            </div>
            {i === selectedIndex && <span style={{ color: colors.success, fontSize: 18 }}>✓</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

function ConceptCard({
  concept,
  isNew,
  matchOverride,
  onClick
}: {
  concept: TranslatedConcept
  isNew?: boolean
  matchOverride?: number
  onClick: () => void
}) {
  const matchPercent = matchOverride ?? concept.matchPercentage
  const headline = concept.headline_sv || concept.headline

  return (
    <button
      onClick={onClick}
      style={{
        ...buttonBase,
        width: '100%',
        background: colors.card,
        borderRadius: 20,
        padding: 20,
        marginBottom: 14,
        textAlign: 'left',
        boxShadow: '0 2px 12px rgba(74, 47, 24, 0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 60,
          height: 80,
          background: isNew
            ? `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 100%)`
            : colors.muted,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 22, color: isNew ? '#fff' : colors.textMuted }}>▶</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16,
            fontWeight: 600,
            color: colors.text,
            marginBottom: 6,
            lineHeight: 1.3,
            fontFamily,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {headline}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={tagStyle}>{matchPercent}% match</span>
            <span style={tagStyle}>{display.difficulty(concept.difficulty).label}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

function MobileDashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  // Check demo mode from URL param or sessionStorage
  const urlDemo = searchParams.get('demo') === 'true'
  const [isDemo, setIsDemo] = useState(urlDemo)

  // Persist demo mode to sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedDemo = sessionStorage.getItem('demo-mode') === 'true'
      if (urlDemo || storedDemo) {
        sessionStorage.setItem('demo-mode', 'true')
        setIsDemo(true)
      }
    }
  }, [urlDemo])

  const [categoryIndex, setCategoryIndex] = useState(0)
  const [showPicker, setShowPicker] = useState(false)

  const categories = demoProfiles.profiles as DemoProfile[]
  const currentCategory = categories[categoryIndex]

  // Load concepts for current category
  const allConcepts = loadConcepts()
  const conceptsForCategory = currentCategory.concepts
    .map(c => {
      const concept = loadConceptById(c.clipId)
      return concept ? { concept, matchOverride: c.matchOverride } : null
    })
    .filter((c): c is { concept: TranslatedConcept; matchOverride: number | undefined } => c !== null)

  // Redirect to login if not authenticated and not in demo mode
  useEffect(() => {
    if (!authLoading && !user && !isDemo) {
      router.push('/m/login')
    }
  }, [user, authLoading, isDemo, router])

  // Show loading state
  if (authLoading) {
    return (
      <div style={{ ...pageContainer, background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 50, height: 50, margin: '0 auto 16px' }}>
            <Image src="/transparent.png" alt="LeTrend" width={50} height={50} style={{ objectFit: 'contain' }} />
          </div>
          <p style={{ color: colors.textMuted, fontFamily }}>Laddar...</p>
        </div>
      </div>
    )
  }

  // Separate new and older concepts
  const newConcepts = conceptsForCategory.filter(c => c.concept.isNew)
  const olderConcepts = conceptsForCategory.filter(c => !c.concept.isNew)

  const handleConceptClick = (conceptId: string) => {
    const demoParam = isDemo ? '?demo=true' : ''
    router.push(`/m/concept/${conceptId}${demoParam}`)
  }

  return (
    <div style={{ ...pageContainer, background: colors.bg }}>
      {showPicker && (
        <CategoryPicker
          categories={categories}
          selectedIndex={categoryIndex}
          onSelect={setCategoryIndex}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div style={scrollContainer}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36 }}>
              <Image
                src="/transparent.png"
                alt="LeTrend"
                width={36}
                height={36}
                style={{ objectFit: 'contain' }}
              />
            </div>
            <span style={{ fontSize: 18, fontWeight: 600, color: colors.text, fontFamily }}>LeTrend</span>
          </div>

          <button
            onClick={() => setShowPicker(true)}
            style={{
              ...buttonBase,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: colors.muted,
              padding: '8px 14px',
              borderRadius: 20,
            }}
          >
            <span style={{ fontSize: 16 }}>{currentCategory.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: colors.text, fontFamily }}>{currentCategory.label}</span>
            <span style={{ color: colors.textSubtle, fontSize: 10 }}>▼</span>
          </button>
        </div>

        {/* Profile Summary */}
        <div style={{ padding: '16px 24px', background: colors.muted }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44,
              height: 44,
              background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 100%)`,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 600,
              fontSize: 18,
              fontFamily
            }}>
              {currentCategory.profile.avatar}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, fontFamily }}>
                {currentCategory.profile.handle}
              </div>
              <div style={{ fontSize: 13, color: colors.textMuted, fontFamily }}>
                {currentCategory.profile.followers} följare · {currentCategory.profile.posts} inlägg analyserade
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {/* New concepts */}
          {newConcepts.length > 0 && (
            <>
              <p style={sectionLabel}>Nytt denna vecka</p>
              {newConcepts.map(({ concept, matchOverride }) => (
                <ConceptCard
                  key={concept.id}
                  concept={concept}
                  isNew={true}
                  matchOverride={matchOverride}
                  onClick={() => handleConceptClick(concept.id)}
                />
              ))}
            </>
          )}

          {/* All/older concepts */}
          {olderConcepts.length > 0 && (
            <>
              <p style={{ ...sectionLabel, marginTop: newConcepts.length > 0 ? 28 : 0 }}>
                {newConcepts.length > 0 ? 'Tidigare' : 'Koncept för dig'}
              </p>
              {olderConcepts.map(({ concept, matchOverride }) => (
                <ConceptCard
                  key={concept.id}
                  concept={concept}
                  isNew={false}
                  matchOverride={matchOverride}
                  onClick={() => handleConceptClick(concept.id)}
                />
              ))}
            </>
          )}

          {/* If no concepts for this category, show all */}
          {conceptsForCategory.length === 0 && (
            <>
              <p style={sectionLabel}>Alla koncept</p>
              {allConcepts.slice(0, 6).map((concept) => (
                <ConceptCard
                  key={concept.id}
                  concept={concept}
                  isNew={concept.isNew}
                  onClick={() => handleConceptClick(concept.id)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MobileDashboard() {
  return (
    <Suspense fallback={
      <div style={{ ...pageContainer, background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 50, height: 50, margin: '0 auto 16px' }}>
            <Image src="/transparent.png" alt="LeTrend" width={50} height={50} style={{ objectFit: 'contain' }} />
          </div>
          <p style={{ color: colors.textMuted, fontFamily }}>Laddar...</p>
        </div>
      </div>
    }>
      <MobileDashboardContent />
    </Suspense>
  )
}
