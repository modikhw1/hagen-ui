import { loadConcepts } from '@/lib/conceptLoader';
import { loadDefaultProfile } from '@/lib/profileLoader';
import { loadLegacyDemoProfiles } from '@/lib/demoProfileLoader';
import { display } from '@/lib/display';
import type { TranslatedConcept } from '@/lib/translator';

// ============================================
// TYPES
// ============================================
export interface DemoProfile {
  id: string;
  icon: string;
  label: string;
  handle: string;
  avatar: string;
  followers: string;
  avgViews: string;
  posts: number;
  tone: string[];
  energy: string;
  teamSize: string;
  topMechanisms: readonly string[];
  recentHits: { title: string; views: string }[];
  conceptMatches: { id: string; match: number }[];
}

export interface UIConcept {
  id: string;
  title: string;
  subtitle: string;
  mechanism: string;
  market: string;
  match: number;
  difficulty: string;
  teamSize: string;
  filmTime: string;
  description: string;
  whyItWorks: string;
  productionNotes: string[];
  script: string;
  videoUrl?: string;
  gcsUri?: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  period: string;
  concepts: number;
  features: string[];
  popular?: boolean;
}

// ============================================
// PLANS
// ============================================
export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 249,
    period: 'mån',
    concepts: 2,
    features: ['2 koncept/månad', 'Fullständiga manus', 'Produktionsguider'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 449,
    period: 'mån',
    concepts: 5,
    features: ['5 koncept/månad', 'Allt i Starter', 'Prioriterad matchning', 'Humor-analys av din profil'],
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 749,
    period: 'mån',
    concepts: 12,
    features: ['12 koncept/månad', 'Allt i Growth', 'Dedikerad support', 'Anpassade koncept'],
  },
];

// ============================================
// DEFAULT LOGGED-IN PROFILE
// ============================================
export const DEFAULT_LOGGED_IN_PROFILE = {
  handle: '@mittforetag',
  avatar: 'M',
  followers: '0',
  avgViews: '0',
  posts: 0,
  tone: ['personlig', 'genuin'],
  energy: 'Balanserad',
  teamSize: '1-2 personer',
  topMechanisms: ['recognition', 'contrast'] as readonly string[],
  recentHits: [] as { title: string; views: string }[],
};

export const DEFAULT_USER_CONCEPT_IDS = [
  { id: 'clip-45435414', match: 92 },
  { id: 'clip-84559877', match: 88 },
  { id: 'clip-44893709', match: 85 },
  { id: 'clip-14943766', match: 82 },
];

// ============================================
// LOADED DATA
// ============================================
function toUIConcept(tc: TranslatedConcept): UIConcept {
  const diffDisplay = display.difficulty(tc.difficulty);
  const peopleDisplay = display.peopleNeeded(tc.peopleNeeded);
  const filmDisplay = display.filmTime(tc.filmTime);
  const marketDisplay = display.market(tc.market);
  const mechDisplay = display.mechanism(tc.mechanism);

  return {
    id: tc.id,
    title: tc.headline_sv || tc.headline,
    subtitle: `${mechDisplay.label}`,
    mechanism: tc.mechanism,
    market: marketDisplay.flag,
    match: tc.matchPercentage,
    difficulty: diffDisplay.label,
    teamSize: peopleDisplay.label,
    filmTime: filmDisplay.label,
    description: tc.description_sv || tc.whyItFits_sv?.join('. ') || tc.whyItFits.join('. '),
    whyItWorks: tc.whyItWorks_sv || `${mechDisplay.label} — ${tc.whyItFits[0] || 'Beprövat format'}`,
    productionNotes: tc.productionNotes_sv || tc.whyItFits_sv || tc.whyItFits,
    script: tc.script_sv || `[Manus genereras...]`,
    videoUrl: tc.sourceUrl,
    gcsUri: tc.gcsUri,
  };
}

const profileData = loadDefaultProfile();
export const BRAND_PROFILE = {
  handle: profileData.handle,
  avatar: profileData.avatarInitial,
  followers: profileData.followers,
  avgViews: profileData.avgViews,
  posts: parseInt(profileData.videoCount) || 0,
  tone: profileData.tone,
  energy: profileData.energy,
  teamSize: profileData.teamSize,
  topMechanisms: profileData.topMechanisms as readonly string[],
  recentHits: profileData.recentHits.map(h => ({
    title: h.title,
    views: h.views,
  })),
};

export const DEMO_PROFILES: DemoProfile[] = loadLegacyDemoProfiles();

const translatedConcepts = loadConcepts();
export const CONCEPTS: UIConcept[] = translatedConcepts.map(toUIConcept);
