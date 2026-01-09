/**
 * Display Layer: Category Keys → UI Values
 *
 * Combines categories.json (icons, colors) with locale (labels)
 * to produce final display values for the UI.
 *
 * Usage:
 *   import { display } from '@/lib/display'
 *   display.mechanism('contrast')  // { label: 'Två Världar Möts', icon: '⚖️', color: '#6B5D4D' }
 *   display.difficulty('easy')     // { label: 'Lätt', color: '#5A8F5A' }
 */

import categories from '@/data/categories.json'
import svLocale from '@/data/locale/sv.json'

// Types
type Categories = typeof categories
type Locale = typeof svLocale

export type HumorMechanism = keyof Categories['humorMechanisms']
export type Difficulty = keyof Categories['difficulties']
export type FilmTime = keyof Categories['filmTimes']
export type PeopleNeeded = keyof Categories['peopleNeeded']
export type VibeAlignment = keyof Categories['vibeAlignments']
export type Market = keyof Categories['markets']
export type TrendLevel = keyof Categories['trendLevels']

// Current locale (later: make this dynamic)
const locale: Locale = svLocale

// ============================================
// DISPLAY FUNCTIONS
// ============================================

export const display = {
  /**
   * Get display values for a humor mechanism
   */
  mechanism(key: HumorMechanism | string) {
    const cat = categories.humorMechanisms[key as HumorMechanism]
    const label = locale.humorMechanisms[key as HumorMechanism]

    if (!cat) {
      return { label: key, icon: '❓', color: '#7D6E5D' }
    }

    return {
      label: label || key,
      icon: cat.icon,
      color: cat.color,
    }
  },

  /**
   * Get display values for difficulty
   */
  difficulty(key: Difficulty | string) {
    const cat = categories.difficulties[key as Difficulty]
    const label = locale.difficulties[key as Difficulty]

    if (!cat) {
      return { label: key, color: '#7D6E5D' }
    }

    return {
      label: label || key,
      color: cat.color,
    }
  },

  /**
   * Get display values for film time
   */
  filmTime(key: FilmTime | string) {
    const cat = categories.filmTimes[key as FilmTime]
    const label = locale.filmTimes[key as FilmTime]

    if (!cat) {
      return { label: key, minutes: 0 }
    }

    return {
      label: label || key,
      minutes: cat.minutes,
    }
  },

  /**
   * Get display values for people needed
   */
  peopleNeeded(key: PeopleNeeded | string) {
    const cat = categories.peopleNeeded[key as PeopleNeeded]
    const label = locale.peopleNeeded[key as PeopleNeeded]

    if (!cat) {
      return { label: key, count: 1 }
    }

    return {
      label: label || key,
      count: cat.count,
    }
  },

  /**
   * Get grammatically correct Swedish text for people needed
   * Returns full phrase like "Bara du", "2 personer", etc.
   */
  peopleNeededGrammar(key: PeopleNeeded | string): string {
    const cat = categories.peopleNeeded[key as PeopleNeeded]
    const label = locale.peopleNeeded[key as PeopleNeeded]

    if (!cat) return key

    // Swedish labels in locale already have correct grammar
    // solo → "Bara du" (not "1 person")
    // duo → "2 personer"
    // small_team → "3 personer"
    // team → "4+ personer"
    return label || key
  },

  /**
   * Get display values for vibe/audience alignment
   */
  vibe(key: VibeAlignment | string) {
    const cat = categories.vibeAlignments[key as VibeAlignment]
    const label = locale.vibeAlignments[key as VibeAlignment]

    if (!cat) {
      return { label: key, icon: '👤' }
    }

    return {
      label: label || key,
      icon: cat.icon,
    }
  },

  /**
   * Get display values for market/country
   */
  market(key: Market | string) {
    const cat = categories.markets[key as Market]
    const label = locale.markets[key as Market]

    if (!cat) {
      return { label: key, flag: '🌍' }
    }

    return {
      label: label || key,
      flag: cat.flag,
    }
  },

  /**
   * Get display values for trend level
   */
  trendLevel(level: number | string) {
    const key = String(level) as TrendLevel
    const cat = categories.trendLevels[key]
    const label = locale.trendLevels[key]

    if (!cat) {
      return { label: '—', icon: '📊' }
    }

    return {
      label: label || cat.label,
      icon: cat.icon,
    }
  },

  /**
   * Get UI string with interpolation
   * display.ui('conceptsRemaining', { count: 3, total: 5 }) → "3 av 5 kvar"
   */
  ui(key: keyof Locale['ui'], vars?: Record<string, string | number>) {
    let text = locale.ui[key] || key

    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v))
      })
    }

    return text
  },

  /**
   * Get "what you get" items list
   */
  whatYouGetItems() {
    return locale.whatYouGetItems
  },

  /**
   * Get key moments list
   */
  keyMoments() {
    return locale.keyMoments
  },
}

// ============================================
// HELPER: Get all options for a category (for dropdowns, filters)
// ============================================

export const categoryOptions = {
  mechanisms(): Array<{ key: HumorMechanism; label: string; icon: string }> {
    return Object.keys(categories.humorMechanisms).map(key => ({
      key: key as HumorMechanism,
      ...display.mechanism(key),
    }))
  },

  difficulties(): Array<{ key: Difficulty; label: string; color: string }> {
    return Object.keys(categories.difficulties).map(key => ({
      key: key as Difficulty,
      ...display.difficulty(key),
    }))
  },

  filmTimes(): Array<{ key: FilmTime; label: string; minutes: number }> {
    return Object.keys(categories.filmTimes).map(key => ({
      key: key as FilmTime,
      ...display.filmTime(key),
    }))
  },

  peopleNeeded(): Array<{ key: PeopleNeeded; label: string; count: number }> {
    return Object.keys(categories.peopleNeeded).map(key => ({
      key: key as PeopleNeeded,
      ...display.peopleNeeded(key),
    }))
  },

  vibes(): Array<{ key: VibeAlignment; label: string; icon: string }> {
    return Object.keys(categories.vibeAlignments).map(key => ({
      key: key as VibeAlignment,
      ...display.vibe(key),
    }))
  },

  markets(): Array<{ key: Market; label: string; flag: string }> {
    return Object.keys(categories.markets).map(key => ({
      key: key as Market,
      ...display.market(key),
    }))
  },
}

export default display
