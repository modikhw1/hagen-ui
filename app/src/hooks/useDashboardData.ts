'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useProfile, DemoProfile, ConceptWithMatch, ProfileMeta } from '@/contexts/ProfileContext'
import { loadConcepts, loadDashboardData } from '@/lib/conceptLoader'
import { mockUserProfile } from '@/mocks/data'
import type { UserProfile } from '@/types'
import type { TranslatedConcept } from '@/lib/translator'

export type { DemoProfile, ConceptWithMatch }

export interface DashboardData {
  // Auth state
  user: ReturnType<typeof useAuth>['user']
  loading: boolean
  isDemo: boolean

  // Profile (for backwards compatibility)
  profile: UserProfile

  // Unified profile (works for both demo and logged-in)
  activeDisplayName: string
  activeProfileMeta: ProfileMeta

  // Demo categories (from ProfileContext)
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
  const { user, loading: authLoading } = useAuth()

  // Use new ProfileContext
  const {
    isDemo,
    profile: contextProfile,
    demoProfiles,
    activeDemoIndex,
    setActiveDemoIndex,
    activeDemoProfile,
    activeDisplayName,
    activeProfileMeta,
    concepts: conceptsFromContext,
    newConcepts: newConceptsFromContext,
  } = useProfile()

  // Convert to UserProfile format for backwards compatibility
  const profile: UserProfile = contextProfile
    ? {
        id: contextProfile.id,
        businessName: contextProfile.business_name,
        businessDescription: contextProfile.business_description || '',
        goals: [],
        constraints: [],
        industryTags: contextProfile.industry ? [contextProfile.industry] : [],
        profileCompleteness: 0,
        socialLinks: {
          tiktok: contextProfile.social_links?.tiktok || undefined,
          instagram: contextProfile.social_links?.instagram || undefined,
        },
      }
    : mockUserProfile

  // Load all concepts
  const allConcepts = loadConcepts()
  const { rows } = loadDashboardData()

  // Use concepts from ProfileContext
  const conceptsForCategory = conceptsFromContext
  const newConcepts = newConceptsFromContext
  const olderConcepts = conceptsForCategory.filter(c => !c.concept.isNew)

  // Actions
  const handleConceptClick = (conceptId: string, mobileRoute = false) => {
    const demoParam = isDemo ? '?demo=true' : ''
    const basePath = mobileRoute ? '/m/concept' : '/concept'
    router.push(`${basePath}/${conceptId}${demoParam}`)
  }

  const handleImproveProfile = () => {
    console.log('Improve profile clicked')
    // TODO: Open profile edit modal/page
  }

  return {
    user,
    loading: authLoading,
    isDemo,
    profile,
    activeDisplayName,
    activeProfileMeta,
    categories: demoProfiles,
    categoryIndex: activeDemoIndex,
    setCategoryIndex: setActiveDemoIndex,
    currentCategory: activeDemoProfile,
    allConcepts,
    conceptsForCategory,
    newConcepts,
    olderConcepts,
    rows,
    handleConceptClick,
    handleImproveProfile,
  }
}
