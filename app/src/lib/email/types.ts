export type EmailType =
  | 'new_concept'
  | 'new_concepts'
  | 'gameplan_updated'
  | 'gameplan_summary'
  | 'weekly_summary'
  | 'custom';

export interface ConceptData {
  id: string;
  headline: string;
  headline_sv?: string;
  matchPercentage: number;
  whyItWorks?: string;
  whyItWorks_sv?: string;
  url?: string;
  thumbnail_url?: string | null;
}

export interface GamePlanData {
  title?: string;
  description?: string;
  goals?: string[];
}

export interface WeeklySummaryClipData {
  id: string;
  title: string;
  thumbnail_url?: string | null;
  url?: string | null;
  views?: number | null;
  publishedAt?: string | null;
  producedAt?: string | null;
  statusLabel?: string;
}

export interface WeeklySummaryNoteData {
  id: string;
  content: string;
  created_at?: string | null;
}

export interface WeeklySummaryPreferences {
  includeNewConcepts: boolean;
  includeNewClips: boolean;
  includeProducedClips: boolean;
  includeClipMetrics: boolean;
  includeCmThoughts: boolean;
  maxConcepts: number;
  maxClips: number;
  maxNotes: number;
}

export interface WeeklySummaryData {
  weekNum?: number;
  conceptsAdded?: number;
  totalConcepts?: number;
  producedCount?: number;
  publishedClipCount?: number;
  newConcepts?: ConceptData[];
  newClips?: WeeklySummaryClipData[];
  producedClips?: WeeklySummaryClipData[];
  cmThoughts?: WeeklySummaryNoteData[];
  preferences?: WeeklySummaryPreferences;
}

export interface CustomerData {
  id?: string;
  business_name: string;
  contact_email: string;
  contact_name?: string;
  customer_contact_name?: string;
}

export interface EmailTemplateData {
  concepts?: ConceptData[];
  gameplan?: GamePlanData;
  intro?: string;
  outro?: string;
  subject?: string;
  body_html?: string;
  weeklySummary?: WeeklySummaryData;
}

export interface EmailRenderOptions {
  dashboardUrl?: string;
  ctaLabel?: string;
}

export interface EmailTemplateResult {
  subject: string;
  html: string;
  text: string;
}

export interface RenderedTemplate {
  subject: string;
  contentHtml: string;
  ctaLabel?: string;
}
