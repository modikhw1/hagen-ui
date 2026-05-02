/**
 * Loader för demo-profiler
 * Läser från demo-profiles.json och returnerar profildata
 */

import demoProfilesData from '@/data/demo-profiles.json';

export interface DemoProfileConcept {
  clipId: string;
  matchOverride: number;
}

export interface DemoProfileData {
  handle: string;
  avatar: string;
  followers: string;
  avgViews: string;
  posts: number;
  tone: string[];
  energy: string;
  teamSize: string;
  topMechanisms: string[];
  recentHits: { title: string; views: string }[];
}

export interface DemoProfile {
  id: string;
  icon: string;
  label: string;
  profile: DemoProfileData;
  concepts: DemoProfileConcept[];
}

export interface DemoProfilesFile {
  _meta: {
    description: string;
    lastUpdated: string;
    version: string;
  };
  profiles: DemoProfile[];
}

/**
 * Ladda alla demo-profiler från JSON
 */
export function loadDemoProfiles(): DemoProfile[] {
  return (demoProfilesData as DemoProfilesFile).profiles;
}

/**
 * Hämta en specifik profil via ID
 */
export function getDemoProfileById(id: string): DemoProfile | undefined {
  return loadDemoProfiles().find(p => p.id === id);
}

/**
 * Konvertera till format som page.tsx förväntar sig (legacy-kompatibilitet)
 */
export function toLegacyDemoProfile(profile: DemoProfile) {
  return {
    id: profile.id,
    icon: profile.icon,
    label: profile.label,
    handle: profile.profile.handle,
    avatar: profile.profile.avatar,
    followers: profile.profile.followers,
    avgViews: profile.profile.avgViews,
    posts: profile.profile.posts,
    tone: profile.profile.tone,
    energy: profile.profile.energy,
    teamSize: profile.profile.teamSize,
    topMechanisms: profile.profile.topMechanisms as readonly string[],
    recentHits: profile.profile.recentHits,
    conceptMatches: profile.concepts.map(c => ({
      id: c.clipId,
      match: c.matchOverride,
    })),
  };
}

/**
 * Ladda alla profiler i legacy-format
 */
export function loadLegacyDemoProfiles() {
  return loadDemoProfiles().map(toLegacyDemoProfile);
}
