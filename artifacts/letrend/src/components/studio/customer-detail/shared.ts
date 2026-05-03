import React from 'react';
import type { CustomerConcept, CustomerGamePlanSummary, CustomerProfile } from '@/types/studio-v2';
import type { TranslatedConcept } from '@/lib/translator';
import {
  getStudioCustomerConceptSourceConceptId,
  getStudioCustomerConceptDisplayTitle,
} from '@/lib/studio/customer-concepts';

export interface EmailTemplate {
  id: string;
  name: string;
  icon: string;
  subject: string;
  intro: string;
  outro: string;
  supportsConceptAttachment: boolean;
  maxConcepts?: number;
}

export interface WorkspaceGamePlanResponse {
  game_plan: CustomerGamePlanSummary;
  has_game_plan: boolean;
}

export type WorkspaceCustomerProfile = CustomerProfile & {
  game_plan?: unknown;
};

export interface EmailScheduleRecord {
  id: string;
  customer_profile_id: string | null;
  schedule_type: string;
  day_of_week: number | null;
  send_time: string | null;
  email_subject: string | null;
  email_intro: string | null;
  email_outro: string | null;
  is_active: boolean | null;
  next_send_at: string | null;
  last_sent_at: string | null;
  rules: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'new_concept',
    name: 'Nytt koncept',
    icon: '📦',
    subject: 'Nytt koncept - LeTrend',
    intro: 'Hej{{contact_name}}!\n\nVi har lagt till ett nytt koncept som vi tror passar perfekt för {{business_name}}.',
    outro: 'Tveka inte att höra av dig om du har frågor!',
    supportsConceptAttachment: true,
    maxConcepts: 1,
  },
  {
    id: 'new_concepts',
    name: 'Nya koncept',
    icon: '📦📦',
    subject: '{{count_capitalized}} nya koncept - LeTrend',
    intro: 'Hej{{contact_name}}!\n\nVi har lagt till {{count}} nya koncept för {{business_name}}.',
    outro: 'Tveka inte att höra av dig om du har frågor!',
    supportsConceptAttachment: true,
    maxConcepts: 10,
  },
  {
    id: 'gameplan_updated',
    name: 'Game Plan uppdaterad',
    icon: '📋',
    subject: 'Uppdaterad Game Plan för {{business_name}} - LeTrend',
    intro: 'Hej{{contact_name}}!\n\nDin Game Plan för {{business_name}} har uppdaterats.',
    outro: 'Tveka inte att höra av dig om du har frågor!',
    supportsConceptAttachment: true,
    maxConcepts: 5,
  },
  {
    id: 'gameplan_summary',
    name: 'Game Plan-sammanfattning',
    icon: '🗺️',
    subject: 'Din nya Game Plan - LeTrend',
    intro: 'Hej{{contact_name}}!\n\nVi har satt ihop en strategisk Game Plan för {{business_name}}.',
    outro: 'Kika igenom och hör av dig med tankar - vi justerar gärna!',
    supportsConceptAttachment: true,
    maxConcepts: 3,
  },
  {
    id: 'weekly_summary',
    name: 'Veckosammanfattning',
    icon: '📊',
    subject: 'Veckouppdatering - LeTrend',
    intro: 'Hej{{contact_name}}!\n\nHär är en sammanfattning av veckan för {{business_name}}.',
    outro: 'Tack för ett bra samarbete!',
    supportsConceptAttachment: false,
  },
  {
    id: 'custom',
    name: 'Anpassat email',
    icon: '✉️',
    subject: '',
    intro: '',
    outro: '',
    supportsConceptAttachment: true,
    maxConcepts: 10,
  },
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

export function getWorkspaceConceptDetails(
  concept: CustomerConcept | null | undefined,
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined
): TranslatedConcept | undefined {
  const sourceConceptId = concept ? getStudioCustomerConceptSourceConceptId(concept) : null;
  return sourceConceptId ? getConceptDetails(sourceConceptId) : undefined;
}

export function getWorkspaceConceptTitle(
  concept: CustomerConcept,
  details?: Pick<TranslatedConcept, 'headline' | 'headline_sv'> | null
): string {
  return getStudioCustomerConceptDisplayTitle(
    concept,
    details?.headline_sv || details?.headline || null
  );
}

export const feedSlotMenuBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: 8,
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 12,
};
