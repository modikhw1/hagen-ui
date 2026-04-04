'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '@/lib/supabase/client'
import demoProfilesData from '@/data/demo-profiles.json'
import { loadConceptById } from '@/lib/conceptLoader'
import type { TranslatedConcept } from '@/lib/translator'
import type { CustomerConceptListItem } from '@/types/customer-concept'

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

export interface DemoConceptWithMatch {
  concept: TranslatedConcept
  matchOverride?: number
}

export interface DashboardConceptCardViewModel {
  conceptId: string
  title: string
  matchPercent: number | null
  difficultyLabel: string
  isNew: boolean
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
  demoConcepts: DemoConceptWithMatch[]
  customerConceptCards: DashboardConceptCardViewModel[]
  newCustomerConceptCards: DashboardConceptCardViewModel[]

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

  // Concepts fetched from database for logged-in customers
  const [userConcepts, setUserConcepts] = useState<CustomerConceptListItem[]>([])

  // Load demo profiles from JSON
  const demoProfiles = demoProfilesData.profiles as DemoProfile[]
  const activeDemoProfile = demoProfiles[activeDemoIndex] || demoProfiles[0]

  // Determine demo mode from URL or session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname
      const urlParams = new URLSearchParams(window.location.search)
      const urlDemo = urlParams.get('demo') === 'true'
      const legacyDemoRoute = pathname.startsWith('/m/legacy-demo')

      // Logged in user takes priority - clear demo mode
      if (user) {
        sessionStorage.removeItem('demo-mode')
        window.setTimeout(() => setIsDemo(false), 0)
        return
      }

      // Not logged in - check for demo mode
      const storedDemo = sessionStorage.getItem('demo-mode') === 'true'
      if (legacyDemoRoute || urlDemo || storedDemo) {
        sessionStorage.setItem('demo-mode', 'true')
        window.setTimeout(() => setIsDemo(true), 0)
      }
    }
  }, [user])

  // Fetch assigned concepts from /api/customer/concepts for logged-in customers
  useEffect(() => {
    async function fetchUserConcepts() {
      if (!user || isDemo) {
        setUserConcepts([])
        return
      }

      // Skip fetching on admin/studio routes - ProfileContext not needed there
      if (typeof window !== 'undefined') {
        const pathname = window.location.pathname
        if (pathname.startsWith('/admin') || pathname.startsWith('/studio')) {
          setUserConcepts([])
          return
        }
      }

      try {
        const res = await fetch('/api/customer/concepts')
        if (!res.ok) {
          console.warn('Could not fetch customer concepts, status:', res.status)
          setUserConcepts([])
          return
        }
        const json = await res.json() as { concepts: CustomerConceptListItem[] }
        setUserConcepts(json.concepts ?? [])
      } catch (err) {
        console.error('Error fetching customer concepts:', err)
        setUserConcepts([])
      }
    }

    fetchUserConcepts()
  }, [user, isDemo])

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

  // Concepts for active profile:
  // - Demo: keep raw TranslatedConcept objects local to demo path
  // - Logged-in customer: normalize into an explicit dashboard card shape
  const demoConcepts: DemoConceptWithMatch[] = isDemo
    ? activeDemoProfile.concepts.reduce<DemoConceptWithMatch[]>((acc, c) => {
        const concept = loadConceptById(c.clipId)
        if (concept) acc.push({ concept, matchOverride: c.matchOverride })
        return acc
      }, [])
    : []

  const customerConceptCards = isDemo
    ? []
    : userConcepts.map((concept) => ({
        conceptId: concept.assignment.id,
        title: concept.metadata.title,
        matchPercent: concept.assignment.match_percentage ?? null,
        difficultyLabel: concept.difficulty_label,
        isNew: concept.is_new,
      }))

  const newCustomerConceptCards = customerConceptCards.filter((concept) => concept.isNew)

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
        demoConcepts,
        customerConceptCards,
        newCustomerConceptCards,
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
