/**
 * Display Layer: Category Keys -> UI Values
 *
 * Combines categories.json (icons, colors) with locale (labels)
 * to produce final display values for the UI.
 */

import categories from '@/data/categories.json'
import svLocale from '@/data/locale/sv.json'

type Categories = typeof categories
type Locale = typeof svLocale

export type HumorMechanism = keyof Categories['humorMechanisms']
export type Difficulty = keyof Categories['difficulties']
export type FilmTime = keyof Categories['filmTimes']
export type PeopleNeeded = keyof Categories['peopleNeeded']
export type BusinessType = keyof Categories['businessTypes']
export type EstimatedBudget = keyof Categories['estimatedBudgets']
export type VibeAlignment = keyof Categories['vibeAlignments']
export type Market = keyof Categories['markets']
export type TrendLevel = keyof Categories['trendLevels']

const locale: Locale = svLocale

export const display = {
  mechanism(key: HumorMechanism | string) {
    const cat = categories.humorMechanisms[key as HumorMechanism]
    const label = locale.humorMechanisms[key as HumorMechanism]

    if (!cat) {
      return { label: key, icon: '❔', color: '#7D6E5D' }
    }

    return {
      label: label || key,
      icon: cat.icon,
      color: cat.color,
    }
  },

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

  filmTimeRange(key: FilmTime | string) {
    const value = display.filmTime(key)
    const minutes = value.minutes

    if (minutes <= 15) {
      return { key: 'quick', label: 'Snabb (5-15 min)', shortLabel: 'Snabb' }
    }

    if (minutes <= 30) {
      return { key: 'medium', label: 'Medel (20-30 min)', shortLabel: 'Medel' }
    }

    return { key: 'long', label: 'Lang (1h+)', shortLabel: 'Lang' }
  },

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

  peopleNeededShort(key: PeopleNeeded | string) {
    const value = display.peopleNeeded(key)

    if (value.count >= 4) {
      return '4+'
    }

    return `${value.count}p`
  },

  peopleNeededGrammar(key: PeopleNeeded | string): string {
    const cat = categories.peopleNeeded[key as PeopleNeeded]
    const label = locale.peopleNeeded[key as PeopleNeeded]
    if (!cat) return key
    return label || key
  },

  businessType(key: BusinessType | string) {
    const cat = categories.businessTypes[key as BusinessType]
    const label = locale.businessTypes[key as BusinessType]

    if (!cat) {
      return { label: key, icon: '🏷️', color: '#7D6E5D' }
    }

    return {
      label: label || key,
      icon: cat.icon,
      color: cat.color,
    }
  },

  budget(key: EstimatedBudget | string) {
    const cat = categories.estimatedBudgets[key as EstimatedBudget]
    const label = locale.estimatedBudgets[key as EstimatedBudget]

    if (!cat) {
      return { label: key, color: '#7D6E5D' }
    }

    return {
      label: label || key,
      color: cat.color,
    }
  },

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

  ui(key: keyof Locale['ui'], vars?: Record<string, string | number>) {
    let text = locale.ui[key] || key

    if (vars) {
      Object.entries(vars).forEach(([token, value]) => {
        text = text.replace(`{${token}}`, String(value))
      })
    }

    return text
  },

  whatYouGetItems() {
    return locale.whatYouGetItems
  },

  keyMoments() {
    return locale.keyMoments
  },
}

export const categoryOptions = {
  mechanisms(): Array<{ key: HumorMechanism; label: string; icon: string; color: string }> {
    return Object.keys(categories.humorMechanisms).map((key) => ({
      key: key as HumorMechanism,
      ...display.mechanism(key),
    }))
  },

  difficulties(): Array<{ key: Difficulty; label: string; color: string }> {
    return Object.keys(categories.difficulties).map((key) => ({
      key: key as Difficulty,
      ...display.difficulty(key),
    }))
  },

  filmTimes(): Array<{ key: FilmTime; label: string; minutes: number }> {
    return Object.keys(categories.filmTimes).map((key) => ({
      key: key as FilmTime,
      ...display.filmTime(key),
    }))
  },

  peopleNeeded(): Array<{ key: PeopleNeeded; label: string; count: number }> {
    return Object.keys(categories.peopleNeeded).map((key) => ({
      key: key as PeopleNeeded,
      ...display.peopleNeeded(key),
    }))
  },

  businessTypes(): Array<{ key: BusinessType; label: string; icon: string; color: string }> {
    return Object.keys(categories.businessTypes).map((key) => ({
      key: key as BusinessType,
      ...display.businessType(key),
    }))
  },

  budgets(): Array<{ key: EstimatedBudget; label: string; color: string }> {
    return Object.keys(categories.estimatedBudgets).map((key) => ({
      key: key as EstimatedBudget,
      ...display.budget(key),
    }))
  },

  vibes(): Array<{ key: VibeAlignment; label: string; icon: string }> {
    return Object.keys(categories.vibeAlignments).map((key) => ({
      key: key as VibeAlignment,
      ...display.vibe(key),
    }))
  },

  markets(): Array<{ key: Market; label: string; flag: string }> {
    return Object.keys(categories.markets).map((key) => ({
      key: key as Market,
      ...display.market(key),
    }))
  },
}

export default display
