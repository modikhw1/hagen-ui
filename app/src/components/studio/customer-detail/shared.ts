import type { CustomerConcept, CustomerGamePlanSummary, CustomerProfile } from '@/types/studio-v2';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  intro: string;
  outro: string;
}

export interface WorkspaceGamePlanResponse {
  game_plan: CustomerGamePlanSummary;
  has_game_plan: boolean;
}

export type WorkspaceCustomerProfile = CustomerProfile & {
  game_plan?: unknown;
};

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'new_concept',
    name: 'Nytt koncept',
    subject: 'Nytt koncept - LeTrend',
    intro: 'Hej{{contact_name}}!\n\nVi har lagt till ett nytt koncept som vi tror passar perfekt för er verksamhet.',
    outro: '\n\nTveka inte att höra av dig om du har frågor!\n\nMed vänliga hälsningar,\nLeTrend'
  },
  {
    id: 'new_concepts',
    name: 'Nya koncept',
    subject: 'Nya koncept - LeTrend',
    intro: 'Hej{{contact_name}}!\n\nVi har lagt till {{count}} nya koncept för er!',
    outro: '\n\nTveka inte att höra av dig om du har frågor!\n\nMed vänliga hälsningar,\nLeTrend'
  },
  {
    id: 'gameplan_updated',
    name: 'Game Plan uppdaterad',
    subject: 'Uppdaterad gameplan för {{business_name}} - LeTrend',
    intro: 'Hej{{contact_name}}!\n\nDin Game Plan har uppdaterats. Kolla in de senaste uppdateringarna!',
    outro: '\n\nTveka inte att höra av dig om du har frågor!\n\nMed vänliga hälsningar,\nLeTrend'
  },
  {
    id: 'weekly_summary',
    name: 'Veckosammanfattning',
    subject: 'Veckoupdatering - LeTrend',
    intro: 'Hej{{contact_name}}!\n\nHär är en sammanfattning av veckan som gick:',
    outro: '\n\nTack för ett bra samarbete!\n\nMed vänliga hälsningar,\nLeTrend'
  },
  {
    id: 'custom',
    name: 'Eget meddelande',
    subject: '',
    intro: '',
    outro: ''
  }
];

export const WORKSPACE_CACHE_TTL_MS = 45_000;
export const WORKSPACE_CACHE_MAX_STALE_MS = 5 * 60_000;

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(0, 0, 0, ${alpha})`;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function hasUnreadUploadMarker(concept: CustomerConcept | null): boolean {
  if (!concept?.result.content_loaded_at) return false;
  if (!concept.result.content_loaded_seen_at) return true;
  return concept.result.content_loaded_seen_at < concept.result.content_loaded_at;
}
