/**
 * Profile Loader - Translation layer for brand profiles
 *
 * Loads raw TikTok profile data and applies:
 * 1. Manual overrides (from brand-profile.json)
 * 2. Derived fields (from video analysis)
 * 3. Defaults (fallbacks)
 *
 * Similar pattern to conceptLoader.ts
 */

import profileData from '@/data/brand-profile.json';

// Raw profile from TikTok API
interface RawProfile {
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  followers: string | null;
  likes: string | null;
  videoCount: string | null;
}

// Derived from video analysis
interface DerivedFields {
  tone: string[];
  energy: string;
  teamSize: string;
  topMechanisms: string[];
  recentHits: {
    title: string;
    views: string;
    contentType: string;
  }[];
}

// Final translated profile for UI
export interface TranslatedProfile {
  // Identity
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  avatarInitial: string;

  // Stats (from override or raw)
  followers: string;
  likes: string;
  avgViews: string;
  videoCount: string;

  // Derived (from video analysis)
  tone: string[];
  energy: string;
  teamSize: string;
  topMechanisms: string[];
  recentHits: {
    title: string;
    views: string;
    contentType: string;
  }[];
}

/**
 * Load a brand profile by ID
 */
export function loadProfile(profileId: string): TranslatedProfile | null {
  const profiles = profileData.profiles as Record<string, {
    raw: RawProfile;
    override?: Partial<RawProfile & { avgViews: string }>;
  }>;
  const derived = profileData.derivedFields as Record<string, DerivedFields>;
  const defaults = profileData.defaults;

  const profile = profiles[profileId];
  if (!profile) {
    return null;
  }

  const raw = profile.raw;
  const override = profile.override || {};
  const derivedData = derived[profileId] || {
    tone: [],
    energy: defaults.energy,
    teamSize: defaults.teamSize,
    topMechanisms: [],
    recentHits: [],
  };

  // Build display name with fallback to handle
  const displayName = raw.displayName || raw.handle.replace('@', '');

  // Get avatar initial from display name
  const avatarInitial = displayName.charAt(0).toUpperCase();

  return {
    // Identity
    handle: raw.handle,
    displayName,
    bio: raw.bio || '',
    avatarUrl: raw.avatarUrl,
    avatarInitial,

    // Stats: override > raw > default
    followers: override.followers || raw.followers || defaults.followers,
    likes: raw.likes || '—',
    avgViews: override.avgViews || defaults.avgViews,
    videoCount: override.videoCount || raw.videoCount || defaults.videoCount,

    // Derived fields
    tone: derivedData.tone,
    energy: derivedData.energy,
    teamSize: derivedData.teamSize,
    topMechanisms: derivedData.topMechanisms,
    recentHits: derivedData.recentHits,
  };
}

/**
 * Load all profiles
 */
export function loadAllProfiles(): TranslatedProfile[] {
  const profileIds = Object.keys(profileData.profiles);
  return profileIds
    .map(id => loadProfile(id))
    .filter((p): p is TranslatedProfile => p !== null);
}

/**
 * Get default profile (first one)
 */
export function loadDefaultProfile(): TranslatedProfile {
  const profileIds = Object.keys(profileData.profiles);
  if (profileIds.length === 0) {
    // Return a fallback if no profiles exist
    return {
      handle: '@demo',
      displayName: 'Demo',
      bio: '',
      avatarUrl: null,
      avatarInitial: 'D',
      followers: profileData.defaults.followers,
      likes: '—',
      avgViews: profileData.defaults.avgViews,
      videoCount: profileData.defaults.videoCount,
      tone: [],
      energy: profileData.defaults.energy,
      teamSize: profileData.defaults.teamSize,
      topMechanisms: [],
      recentHits: [],
    };
  }
  return loadProfile(profileIds[0])!;
}

/**
 * Format number to Swedish style
 * 12400 → "12,4K"
 */
export function formatStatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace('.', ',') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace('.', ',') + 'K';
  }
  return num.toString();
}
