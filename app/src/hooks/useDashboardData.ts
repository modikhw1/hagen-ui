'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { loadConcepts, loadConceptById, loadDashboardData } from '@/lib/conceptLoader'
import { mockUserProfile } from '@/mocks/data'
import demoProfiles from '@/data/demo-profiles.json'
import type { UserProfile } from '@/types'
import type { TranslatedConcept } from '@/lib/translator'

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

export interface DashboardData {
  // Auth state
  user: ReturnType<typeof useAuth>['user']
  loading: boolean
  isDemo: boolean

  // Profile
  profile: UserProfile

  // Demo categories
  categories: DemoProfile[]
  categoryIndex: number
  setCategoryIndex: (index: number) => void
  currentCategory: DemoProfile

  // Concepts
  allConcepts: TranslatedConcept[]
  conceptsForCategory: ConceptWithMatch[]
  newConcepts: ConceptWithMatch[]
  olderConcepts: ConceptWithMatch[]
  rows: ReturnType<typeof loadDashboardData>['rows']

  // Actions
  handleConceptClick: (conceptId: string, mobileRoute?: boolean) => void
  handleImproveProfile: () => void
}

export function useDashboardData(): DashboardData {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile: authProfile, loading: authLoading } = useAuth()

  // Demo mode from URL or sessionStorage
  const urlDemo = searchParams.get('demo') === 'true'
  const [isDemo, setIsDemo] = useState(urlDemo)
  const [categoryIndex, setCategoryIndex] = useState(0)

  // Persist demo mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedDemo = sessionStorage.getItem('demo-mode') === 'true'
      if (urlDemo || storedDemo) {
        sessionStorage.setItem('demo-mode', 'true')
        setIsDemo(true)
      }
    }
  }, [urlDemo])

  // Categories from demo profiles
  const categories = demoProfiles.profiles as DemoProfile[]
  const currentCategory = categories[categoryIndex]

  // Convert auth profile to UserProfile format
  const profile: UserProfile = authProfile
    ? {
        id: authProfile.id,
        businessName: authProfile.business_name,
        businessDescription: authProfile.business_description || '',
        goals: authProfile.goals || [],
        constraints: authProfile.constraints || [],
        industryTags: authProfile.industry_tags || [],
        profileCompleteness: authProfile.profile_completeness || 0,
        socialLinks: {
          tiktok: authProfile.social_tiktok || undefined,
          instagram: authProfile.social_instagram || undefined,
        },
      }
    : mockUserProfile

  // Load concepts
  const allConcepts = loadConcepts()
  const { rows } = loadDashboardData()

  const conceptsForCategory: ConceptWithMatch[] = currentCategory.concepts
    .reduce<ConceptWithMatch[]>((acc, c) => {
      const concept = loadConceptById(c.clipId)
      if (concept) {
        acc.push({ concept, matchOverride: c.matchOverride })
      }
      return acc
    }, [])

  const newConcepts = conceptsForCategory.filter(c => c.concept.isNew)
  const olderConcepts = conceptsForCategory.filter(c => !c.concept.isNew)

  // Actions
  const handleConceptClick = (conceptId: string, mobileRoute = false) => {
    const demoParam = isDemo ? '?demo=true' : ''
    const basePath = mobileRoute ? '/m/concept' : '/concept'
    router.push(`${basePath}/${conceptId}${demoParam}`)
  }

  const handleImproveProfile = () => {
    console.log('Improve profile clicked')
    // TODO: Open chat or profile page
  }

  return {
    user,
    loading: authLoading,
    isDemo,
    profile,
    categories,
    categoryIndex,
    setCategoryIndex,
    currentCategory,
    allConcepts,
    conceptsForCategory,
    newConcepts,
    olderConcepts,
    rows,
    handleConceptClick,
    handleImproveProfile,
  }
}
