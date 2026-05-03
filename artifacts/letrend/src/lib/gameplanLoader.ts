/**
 * Game Plan Loader
 *
 * Loads personalized strategy notes that complement concepts.
 * Supports various content types: text, headings, links, images.
 * Supports per-user gameplans based on handle.
 */

import defaultGameplan from '@/data/gameplan.json';
import mackerietGameplan from '@/data/gameplan-mackeriet.json';

// Link types for different platforms
export type LinkType = 'tiktok' | 'instagram' | 'youtube' | 'article' | 'external';

// Individual link
export interface GamePlanLink {
  label: string;
  url: string;
  linkType: LinkType;
}

// Image with optional caption
export interface GamePlanImage {
  url: string;
  caption?: string;
}

// Note types
export interface TextNote {
  type: 'text';
  content: string;
}

export interface HeadingNote {
  type: 'heading';
  content: string;
}

export interface LinkNote {
  type: 'link';
  label: string;
  url: string;
  linkType: LinkType;
}

export interface LinksNote {
  type: 'links';
  links: GamePlanLink[];
}

export interface ImageNote {
  type: 'image';
  url: string;
  caption?: string;
}

export interface ImagesNote {
  type: 'images';
  images: GamePlanImage[];
}

export type GamePlanNote = TextNote | HeadingNote | LinkNote | LinksNote | ImageNote | ImagesNote;

export interface GamePlan {
  lastUpdated: string;
  brandHandle: string;
  notes: GamePlanNote[];
}

// Map of handles to gameplans
const gameplans: Record<string, GamePlan> = {
  '@mellowcafe': defaultGameplan as GamePlan,
  '@mackeriet': mackerietGameplan as GamePlan,
};

/**
 * Load the game plan data for a specific handle
 * Falls back to default if no matching gameplan exists
 */
export function loadGamePlan(handle?: string): GamePlan {
  if (handle && gameplans[handle.toLowerCase()]) {
    return gameplans[handle.toLowerCase()];
  }
  // Default fallback
  return defaultGameplan as GamePlan;
}

/**
 * Check if a gameplan exists for a handle
 */
export function hasGamePlan(handle: string): boolean {
  return !!gameplans[handle.toLowerCase()];
}

/**
 * Format date for display (e.g., "2025-01-08" → "8 jan")
 */
export function formatGamePlanDate(dateStr: string): string {
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const date = new Date(dateStr);
  const day = date.getDate();
  const month = months[date.getMonth()];
  return `${day} ${month}`;
}
