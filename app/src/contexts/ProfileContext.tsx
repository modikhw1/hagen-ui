'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '@/lib/supabase/client'
import demoProfilesData from '@/data/demo-profiles.json'
import { loadConceptById } from '@/lib/conceptLoader'
import type { TranslatedConcept } from '@/lib/translator'

// ============================================
// TYPES
// ============================================

export interface Profile {
  id: string
  email?: string
  business_name: string
  business_description: string | null
  // New flexible fields
  social_links: { tiktok?: string; instagram?: string; [key: string]: string | undefined }
  tone: string[]
  energy: string | null
  industry: string | null
  matching_data: Record<string, unknown>
  // Flags
  has_paid?: boolean
  has_concepts?: boolean
  is_admin?: boolean
  // Extensible
  [key: string]: unknown
}

// Default profile for new/empty users (uses Café template)
const DEFAULT_USER_PROFILE_META = {
  handle: '@mittforetag',
  avatar: 'M',
  followers: '0',
  avgViews: '0',
  posts: 0,
  tone: ['personlig', 'genuin'],
  energy: 'Balanserad',
  teamSize: '1-2 personer',
  topMechanisms: ['recognition', 'contrast'],
  recentHits: [] as { title: string; views: string }[],
}

// Default concepts for new users (curated selection)
const DEFAULT_USER_CONCEPTS = [
  { clipId: 'clip-45435414', matchOverride: 92 },
  { clipId: 'clip-84559877', matchOverride: 88 },
  { clipId: 'clip-44893709', matchOverride: 85 },
  { clipId: 'clip-14943766', matchOverride: 82 },
]

export interface DemoProfile {
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

export interface ConceptWithMatch {
  concept: TranslatedConcept
  matchOverride?: number
}

export interface ProfileMeta {
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

interface ProfileContextType {
  // Mode
  isDemo: boolean

  // Real profile (null if demo)
  profile: Profile | null
  profileLoading: boolean

  // Demo profiles
  demoProfiles: DemoProfile[]
  activeDemoIndex: number
  setActiveDemoIndex: (index: number) => void
  activeDemoProfile: DemoProfile

  // Unified active profile (always has value)
  activeDisplayName: string
  activeProfileMeta: ProfileMeta

  // Concepts for active profile
  concepts: ConceptWithMatch[]
  newConcepts: ConceptWithMatch[]

  // CRUD operations (real profiles only)
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>
  refreshProfile: () => Promise<void>
}

// ============================================
// CONTEXT
// ============================================

const ProfileContext = createContext<ProfileContextType | undefined>(undefined)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, profile: authProfile, loading: authLoading, refreshProfile: authRefreshProfile } = useAuth()

  // Demo state
  const [isDemo, setIsDemo] = useState(false)
  const [activeDemoIndex, setActiveDemoIndex] = useState(0)

  // Load demo profiles from JSON
  const demoProfiles = demoProfilesData.profiles as DemoProfile[]
  const activeDemoProfile = demoProfiles[activeDemoIndex] || demoProfiles[0]

  // Determine demo mode from URL or session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const urlDemo = urlParams.get('demo') === 'true'

      // Logged in user takes priority - clear demo mode
      if (user) {
        sessionStorage.removeItem('demo-mode')
        setIsDemo(false)
        return
      }

      // Not logged in - check for demo mode
      const storedDemo = sessionStorage.getItem('demo-mode') === 'true'
      if (urlDemo || storedDemo) {
        sessionStorage.setItem('demo-mode', 'true')
        setIsDemo(true)
      }
    }
  }, [user])

  // Convert auth profile to our Profile type
  const profile: Profile | null = authProfile ? {
    id: authProfile.id,
    email: authProfile.email,
    business_name: authProfile.business_name,
    business_description: authProfile.business_description,
    social_links: authProfile.social_links || {},
    tone: authProfile.tone || [],
    energy: authProfile.energy,
    industry: authProfile.industry,
    matching_data: authProfile.matching_data || {},
    has_paid: authProfile.has_paid,
    has_concepts: authProfile.has_concepts,
    is_admin: authProfile.is_admin,
  } : null

  // Active display name
  const activeDisplayName = isDemo
    ? activeDemoProfile.label
    : (profile?.business_name || 'Mitt Företag')

  // Active profile meta (unified for demo/real)
  const activeProfileMeta: ProfileMeta = isDemo
    ? activeDemoProfile.profile
    : {
        handle: profile?.social_links?.tiktok || DEFAULT_USER_PROFILE_META.handle,
        avatar: profile?.business_name?.charAt(0) || 'M',
        followers: DEFAULT_USER_PROFILE_META.followers, // TODO: fetch from TikTok API
        avgViews: DEFAULT_USER_PROFILE_META.avgViews,
        posts: DEFAULT_USER_PROFILE_META.posts,
        tone: profile?.tone?.length ? profile.tone : DEFAULT_USER_PROFILE_META.tone,
        energy: profile?.energy || DEFAULT_USER_PROFILE_META.energy,
        teamSize: DEFAULT_USER_PROFILE_META.teamSize,
        topMechanisms: DEFAULT_USER_PROFILE_META.topMechanisms,
        recentHits: DEFAULT_USER_PROFILE_META.recentHits,
      }

  // Concepts for active profile
  const conceptSource = isDemo
    ? activeDemoProfile.concepts
    : DEFAULT_USER_CONCEPTS

  const concepts: ConceptWithMatch[] = conceptSource.reduce<ConceptWithMatch[]>((acc, c) => {
    const concept = loadConceptById(c.clipId)
    if (concept) {
      acc.push({ concept, matchOverride: c.matchOverride })
    }
    return acc
  }, [])

  const newConcepts = concepts.filter(c => c.concept.isNew)

  // Update profile (optimistic + sync)
  const updateProfile = useCallback(async (updates: Partial<Profile>): Promise<{ error: Error | null }> => {
    if (!user || isDemo) {
      return { error: new Error('Cannot update profile in demo mode') }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('profiles')
        .update(updates)
        .eq('id', user.id)

      if (error) {
        return { error: new Error(error.message) }
      }

      // Refresh to get updated data
      await authRefreshProfile()

      return { error: null }
    } catch (err) {
      return { error: err as Error }
    }
  }, [user, isDemo, authRefreshProfile])

  // Refresh profile
  const refreshProfile = useCallback(async () => {
    if (!isDemo) {
      await authRefreshProfile()
    }
  }, [isDemo, authRefreshProfile])

  return (
    <ProfileContext.Provider
      value={{
        isDemo,
        profile,
        profileLoading: authLoading,
        demoProfiles,
        activeDemoIndex,
        setActiveDemoIndex,
        activeDemoProfile,
        activeDisplayName,
        activeProfileMeta,
        concepts,
        newConcepts,
        updateProfile,
        refreshProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const context = useContext(ProfileContext)
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider')
  }
  return context
}
