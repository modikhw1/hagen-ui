/**
 * Concept Loader
 *
 * Loads clips from JSON, applies translations, and returns concepts.
 *
 * Usage:
 *   import { loadConcepts, loadConceptById } from '@/lib/conceptLoader'
 *   const concepts = loadConcepts()
 */

import { translateClipToConcept, type BackendClip, type TranslatedConcept, type ClipOverride, type ClipDefaults } from './translator'
import clipsData from '@/data/clips-priority.json'

// Type for the clips.json structure
interface ClipsData {
  _meta: {
    version: string
    lastUpdated: string
    description: string
  }
  clips: BackendClip[]
  overrides: Record<string, ClipOverride>
  defaults: ClipDefaults
}

/**
 * Load all concepts from clips.json
 */
export function loadConcepts(): TranslatedConcept[] {
  const data = clipsData as unknown as ClipsData

  return data.clips.map(clip => {
    const override = data.overrides[clip.id]
    return translateClipToConcept(clip, override, data.defaults)
  })
}

/**
 * Load a single concept by ID
 */
export function loadConceptById(id: string): TranslatedConcept | undefined {
  const concepts = loadConcepts()
  return concepts.find(c => c.id === id)
}

/**
 * Get all clips raw (for admin/debug)
 */
export function getRawClips(): BackendClip[] {
  const data = clipsData as ClipsData
  return data.clips
}

/**
 * Dashboard row structure
 */
interface DashboardRow {
  id: string
  title: string
  subtitle: string
  concepts: TranslatedConcept[]
}

/**
 * Generate dashboard rows from concepts
 */
export function generateDashboardRows(concepts: TranslatedConcept[]): DashboardRow[] {
  return [
    {
      id: 'top-matches',
      title: 'Bästa matchningar',
      subtitle: 'Passar bäst för ditt varumärke',
      concepts: concepts
        .sort((a, b) => b.matchPercentage - a.matchPercentage)
        .slice(0, 4),
    },
    {
      id: 'fresh',
      title: 'Nytt denna vecka',
      subtitle: 'Nyligen tillagt',
      concepts: concepts.filter(c => c.isNew),
    },
    {
      id: 'easy-wins',
      title: 'Snabba vinster',
      subtitle: 'Filma på under 15 minuter',
      concepts: concepts.filter(c => c.difficulty === 'easy').slice(0, 4),
    },
    {
      id: 'trending',
      title: 'Trendar nu',
      subtitle: 'Populära format just nu',
      concepts: concepts.filter(c => c.trendLevel >= 4),
    },
  ].filter(row => row.concepts.length > 0)
}

/**
 * Load concepts and generate dashboard data
 */
export function loadDashboardData(): {
  concepts: TranslatedConcept[]
  rows: DashboardRow[]
} {
  const concepts = loadConcepts()
  const rows = generateDashboardRows(concepts)
  return { concepts, rows }
}

// Pre-loaded exports
export const concepts = loadConcepts()
export const dashboardRows = generateDashboardRows(concepts)

// Re-export types for consumers
export type { TranslatedConcept, BackendClip, ClipOverride, ClipDefaults } from './translator'
