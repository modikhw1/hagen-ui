'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  useDashboardData,
  DashboardConceptCardViewModel,
  DemoConceptWithMatch,
  DemoProfile,
} from '@/hooks/useDashboardData'
import { useAuth } from '@/contexts/AuthContext'
import { display } from '@/lib/display'
import type { TranslatedConcept } from '@/lib/translator'
import { colors, fontFamily, pageContainer, scrollContainer, buttonBase, headerStyle, sectionLabel, tagStyle } from '@/styles/mobile-design'

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
  title,
  isNew,
  matchPercent,
  difficultyLabel,
  onClick
}: {
  title: string
  isNew?: boolean
  matchPercent?: number | null
  difficultyLabel: string
  onClick: () => void
}) {
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
            {title}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={tagStyle}>{matchPercent}% match</span>
            <span style={tagStyle}>{difficultyLabel}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

function toDemoConceptCardViewModel(entry: DemoConceptWithMatch): DashboardConceptCardViewModel {
  return {
    conceptId: entry.concept.id,
    title: entry.concept.headline_sv || entry.concept.headline,
    matchPercent: entry.matchOverride ?? entry.concept.matchPercentage,
    difficultyLabel: display.difficulty(entry.concept.difficulty).label,
    isNew: entry.concept.isNew ?? false,
  }
}

function toDemoLibraryCardViewModel(concept: TranslatedConcept): DashboardConceptCardViewModel {
  return {
    conceptId: concept.id,
    title: concept.headline_sv || concept.headline,
    matchPercent: concept.matchPercentage,
    difficultyLabel: display.difficulty(concept.difficulty).label,
    isNew: concept.isNew ?? false,
  }
}

function LoadingScreen() {
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

function DashboardMobileContent() {
  const router = useRouter()
  const {
    user,
    loading,
    isDemo,
    activeProfileMeta,
    categories,
    categoryIndex,
    setCategoryIndex,
    currentCategory,
    allConcepts,
    demoConceptsForCategory,
    customerConceptCards,
    newCustomerConceptCards,
    olderCustomerConceptCards,
    handleConceptClick,
  } = useDashboardData()
  const { signOut } = useAuth()

  const [showPicker, setShowPicker] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const demoNewConceptCards = demoConceptsForCategory
    .filter((entry) => entry.concept.isNew)
    .map(toDemoConceptCardViewModel)
  const demoOlderConceptCards = demoConceptsForCategory
    .filter((entry) => !entry.concept.isNew)
    .map(toDemoConceptCardViewModel)

  const visibleNewConceptCards = isDemo ? demoNewConceptCards : newCustomerConceptCards
  const visibleOlderConceptCards = isDemo ? demoOlderConceptCards : olderCustomerConceptCards
  const hasVisibleConceptCards =
    isDemo ? demoConceptsForCategory.length > 0 : customerConceptCards.length > 0

  const handleLogout = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('demo-mode')
    }
    if (!isDemo && user) {
      await signOut()
    }
    router.push('/m/login')
  }

  // Redirect to login if not authenticated and not in demo mode
  useEffect(() => {
    if (!loading && !user && !isDemo) {
      router.push('/m/login')
    }
  }, [user, loading, isDemo, router])

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <div style={{ ...pageContainer, background: colors.bg }}>
      {isDemo && showPicker && (
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isDemo && (
              <button
                onClick={() => setShowPicker(true)}
                style={{
                  ...buttonBase,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: colors.muted,
                  padding: '8px 12px',
                  borderRadius: 16,
                }}
              >
                <span style={{ fontSize: 14 }}>{currentCategory.icon}</span>
                <span style={{ color: colors.textSubtle, fontSize: 10 }}>▼</span>
              </button>
            )}

            {/* Hamburger menu button */}
            <button
              onClick={() => setShowMenu(!showMenu)}
              style={{
                ...buttonBase,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: 10,
                background: colors.muted,
                borderRadius: 10,
              }}
            >
              <span style={{ width: 18, height: 2, background: colors.text, borderRadius: 1 }} />
              <span style={{ width: 18, height: 2, background: colors.text, borderRadius: 1 }} />
              <span style={{ width: 18, height: 2, background: colors.text, borderRadius: 1 }} />
            </button>
          </div>
        </div>

        {/* Dropdown menu */}
        {showMenu && (
          <>
            <div
              onClick={() => setShowMenu(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.3)',
                zIndex: 40
              }}
            />
            <div style={{
              position: 'absolute',
              top: 60,
              right: 16,
              background: colors.card,
              borderRadius: 12,
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              minWidth: 180,
              zIndex: 50,
              overflow: 'hidden'
            }}>
              {(isDemo ? [
                { label: 'Avsluta demo', onClick: () => { handleLogout(); setShowMenu(false); }, danger: true }
              ] : [
                { label: 'Min plan', onClick: () => { router.push('/m/feed'); setShowMenu(false); } },
                { label: 'Fakturering', onClick: () => { console.log('Billing'); setShowMenu(false); } },
                { label: 'Inställningar', onClick: () => { console.log('Settings'); setShowMenu(false); } },
                { label: 'Logga ut', onClick: () => { handleLogout(); setShowMenu(false); }, danger: true }
              ]).map((item, index, arr) => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  style={{
                    ...buttonBase,
                    width: '100%',
                    padding: '14px 18px',
                    borderBottom: index < arr.length - 1 ? `1px solid ${colors.muted}` : 'none',
                    textAlign: 'left',
                    fontSize: 14,
                    color: item.danger ? '#C45C5C' : colors.text,
                    fontFamily
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}

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
              {activeProfileMeta.avatar}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, fontFamily }}>
                {activeProfileMeta.handle}
              </div>
              <div style={{ fontSize: 13, color: colors.textMuted, fontFamily }}>
                {activeProfileMeta.followers} följare · {activeProfileMeta.posts} inlägg analyserade
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {/* New concepts */}
          {visibleNewConceptCards.length > 0 && (
            <>
              <p style={sectionLabel}>Nytt denna vecka</p>
              {visibleNewConceptCards.map((concept) => (
                <ConceptCard
                  key={concept.conceptId}
                  title={concept.title}
                  isNew={concept.isNew}
                  matchPercent={concept.matchPercent}
                  difficultyLabel={concept.difficultyLabel}
                  onClick={() => handleConceptClick(concept.conceptId, true)}
                />
              ))}
            </>
          )}

          {/* All/older concepts */}
          {visibleOlderConceptCards.length > 0 && (
            <>
              <p style={{ ...sectionLabel, marginTop: visibleNewConceptCards.length > 0 ? 28 : 0 }}>
                {visibleNewConceptCards.length > 0 ? 'Tidigare' : 'Koncept för dig'}
              </p>
              {visibleOlderConceptCards.map((concept) => (
                <ConceptCard
                  key={concept.conceptId}
                  title={concept.title}
                  isNew={concept.isNew}
                  matchPercent={concept.matchPercent}
                  difficultyLabel={concept.difficultyLabel}
                  onClick={() => handleConceptClick(concept.conceptId, true)}
                />
              ))}
            </>
          )}

          {/* Empty state: demo shows sample concepts, logged-in shows message */}
          {!hasVisibleConceptCards && (
            isDemo ? (
              <>
                <p style={sectionLabel}>Alla koncept</p>
                {allConcepts.slice(0, 6).map((concept) => {
                  const demoCard = toDemoLibraryCardViewModel(concept)
                  return (
                    <ConceptCard
                      key={demoCard.conceptId}
                      title={demoCard.title}
                      isNew={demoCard.isNew}
                      matchPercent={demoCard.matchPercent}
                      difficultyLabel={demoCard.difficultyLabel}
                      onClick={() => handleConceptClick(demoCard.conceptId, true)}
                    />
                  )
                })}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎬</div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>
                  Inga koncept tilldelade ännu
                </div>
                <div style={{ fontSize: '14px', lineHeight: 1.5 }}>
                  Din content manager kommer snart tilldela koncept till dig.
                </div>
              </div>
            )
          )}

        </div>
      </div>
    </div>
  )
}

export function DashboardMobile() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DashboardMobileContent />
    </Suspense>
  )
}
