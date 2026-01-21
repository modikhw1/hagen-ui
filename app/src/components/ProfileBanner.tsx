'use client'

import { useState } from 'react'

interface ProfileData {
  handle: string
  avatar: string
  followers: string
  avgViews?: string
  posts: number
  tone: string[]
  energy: string
  teamSize: string
  topMechanisms: readonly string[]
  recentHits: { title: string; views: string }[]
}

interface ProfileBannerProps {
  profile: ProfileData
  variant?: 'desktop' | 'mobile'
  expandable?: boolean
  defaultExpanded?: boolean
  onToggleExpand?: (expanded: boolean) => void
}

/**
 * Responsive ProfileBanner component
 * Shows brand/creator profile with collapsible details
 * Works for both desktop and mobile layouts
 */
export function ProfileBanner({
  profile,
  variant = 'desktop',
  expandable = true,
  defaultExpanded = false,
  onToggleExpand
}: ProfileBannerProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const isMobile = variant === 'mobile'

  const handleToggle = () => {
    const newExpanded = !isExpanded
    setIsExpanded(newExpanded)
    onToggleExpand?.(newExpanded)
  }

  return (
    <div
      style={{
        padding: isMobile ? '16px 20px' : '20px 24px',
        background: 'linear-gradient(145deg, #4A2F18, #3D2510)',
        borderRadius: isMobile ? '16px' : '20px',
        marginBottom: isMobile ? '20px' : '32px',
      }}
    >
      {/* Header - Always visible */}
      <div
        onClick={expandable ? handleToggle : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          cursor: expandable ? 'pointer' : 'default',
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: isMobile ? '44px' : '48px',
            height: isMobile ? '44px' : '48px',
            borderRadius: '50%',
            background: 'rgba(250,248,245,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FAF8F5',
            fontSize: isMobile ? '18px' : '20px',
            fontWeight: '600',
            flexShrink: 0,
          }}
        >
          {profile.avatar}
        </div>

        {/* Profile info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: isMobile ? '15px' : '16px',
              fontWeight: '600',
              color: '#FAF8F5',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {profile.handle}
          </div>
          <div
            style={{
              fontSize: isMobile ? '11px' : '12px',
              color: 'rgba(250,248,245,0.6)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {profile.followers} följare · {profile.posts} inlägg analyserade
          </div>
        </div>

        {/* Expand arrow */}
        {expandable && (
          <span
            style={{
              color: 'rgba(250,248,245,0.5)',
              fontSize: '14px',
              transform: isExpanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
              flexShrink: 0,
            }}
          >
            ▼
          </span>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div
          style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(250,248,245,0.1)',
          }}
        >
          {/* Energy and Team Size */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '10px',
                  color: 'rgba(250,248,245,0.5)',
                  marginBottom: '4px',
                  letterSpacing: '0.5px',
                }}
              >
                DIN ENERGI
              </div>
              <div style={{ fontSize: isMobile ? '13px' : '14px', color: '#FAF8F5' }}>
                {profile.energy}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: '10px',
                  color: 'rgba(250,248,245,0.5)',
                  marginBottom: '4px',
                  letterSpacing: '0.5px',
                }}
              >
                TEAMSTORLEK
              </div>
              <div style={{ fontSize: isMobile ? '13px' : '14px', color: '#FAF8F5' }}>
                {profile.teamSize}
              </div>
            </div>
          </div>

          {/* Tone */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '10px',
                color: 'rgba(250,248,245,0.5)',
                marginBottom: '6px',
                letterSpacing: '0.5px',
              }}
            >
              DIN TON
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {profile.tone.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: isMobile ? '10px' : '11px',
                    padding: isMobile ? '3px 8px' : '4px 10px',
                    background: 'rgba(250,248,245,0.12)',
                    borderRadius: '10px',
                    color: '#FAF8F5',
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Top Mechanisms */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '10px',
                color: 'rgba(250,248,245,0.5)',
                marginBottom: '6px',
                letterSpacing: '0.5px',
              }}
            >
              DINA TOP MEKANISMER
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {profile.topMechanisms.map((mech) => (
                <span
                  key={mech}
                  style={{
                    fontSize: isMobile ? '10px' : '11px',
                    padding: isMobile ? '3px 8px' : '4px 10px',
                    background: 'rgba(250,248,245,0.12)',
                    borderRadius: '10px',
                    color: '#FAF8F5',
                  }}
                >
                  {mech}
                </span>
              ))}
            </div>
          </div>

          {/* Recent Hits */}
          {profile.recentHits && profile.recentHits.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: '10px',
                  color: 'rgba(250,248,245,0.5)',
                  marginBottom: '6px',
                  letterSpacing: '0.5px',
                }}
              >
                SENASTE HITS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {profile.recentHits.map((hit, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: isMobile ? '11px' : '12px',
                      color: '#FAF8F5',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {hit.title}
                    </span>
                    <span style={{ color: 'rgba(250,248,245,0.6)', flexShrink: 0 }}>{hit.views}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
