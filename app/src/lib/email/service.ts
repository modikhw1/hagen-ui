import { z } from 'zod';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { loadConceptById } from '@/lib/conceptLoader';
import { resolveCustomerConceptContentOverrides } from '@/lib/customer-concept-overrides';
import { extractGamePlanEmailData, resolveGamePlanDocument } from '@/lib/game-plan';
import { getAppUrl } from '@/lib/url/public';
import { buildEmailContent } from './render';
import {
  formatShortDateSv,
  getPreviousWeekRange,
  htmlToText,
  normalizeWeeklySummaryPreferences,
  numberToSwedish,
  replaceTemplatePlaceholders,
} from './helpers';
import type {
  ConceptData,
  CustomerData,
  EmailTemplateResult,
  EmailType,
  WeeklySummaryClipData,
  WeeklySummaryData,
  WeeklySummaryNoteData,
} from './types';

const emailTypeSchema = z.enum([
  'new_concept',
  'new_concepts',
  'gameplan_updated',
  'gameplan_summary',
  'weekly_summary',
  'custom',
]);

const gamePlanSchema = z.object({
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  goals: z.array(z.string().trim().min(1).max(300)).max(10).optional(),
}).optional();

const weeklySummaryPreferencesSchema = z.object({
  includeNewConcepts: z.boolean().optional(),
  includeNewClips: z.boolean().optional(),
  includeProducedClips: z.boolean().optional(),
  includeClipMetrics: z.boolean().optional(),
  includeCmThoughts: z.boolean().optional(),
  maxConcepts: z.number().int().min(1).max(10).optional(),
  maxClips: z.number().int().min(1).max(10).optional(),
  maxNotes: z.number().int().min(1).max(10).optional(),
}).optional();

const weeklySummarySchema = z.object({
  weekNum: z.number().int().min(1).max(53).optional(),
  conceptsAdded: z.number().int().min(0).max(999).optional(),
  totalConcepts: z.number().int().min(0).max(9999).optional(),
  producedCount: z.number().int().min(0).max(999).optional(),
  publishedClipCount: z.number().int().min(0).max(999).optional(),
  preferences: weeklySummaryPreferencesSchema,
}).optional();

const emailAddressSchema = z.string().trim().email();

export const sendEmailPayloadSchema = z.object({
  customer_id: z.string().trim().min(1),
  subject: z.string().trim().min(1).max(250).optional(),
  body_html: z.string().trim().min(1).max(500_000).optional(),
  email_type: emailTypeSchema.optional(),
  concept_ids: z.array(z.string().trim().min(1)).max(10).optional(),
  intro: z.string().trim().max(20_000).optional(),
  outro: z.string().trim().max(20_000).optional(),
  gameplan: gamePlanSchema,
  weekly_summary: weeklySummarySchema,
}).superRefine((payload, ctx) => {
  if (!payload.body_html && !payload.email_type) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'email_type eller body_html krävs',
      path: ['email_type'],
    });
  }

  if (payload.email_type === 'custom' && !payload.subject && !payload.body_html) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'subject krävs för custom-email',
      path: ['subject'],
    });
  }

  if (payload.email_type === 'new_concept' && (payload.concept_ids?.length || 0) > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'new_concept stödjer exakt ett koncept',
      path: ['concept_ids'],
    });
  }
});

export type SendEmailPayload = z.infer<typeof sendEmailPayloadSchema>;

export const EMAIL_TEMPLATE_DEFINITIONS: Array<{
  id: EmailType;
  name: string;
  icon: string;
  supportsConceptAttachment: boolean;
  maxConcepts?: number;
}> = [
  { id: 'new_concept', name: 'Nytt koncept', icon: '📦', supportsConceptAttachment: true, maxConcepts: 1 },
  { id: 'new_concepts', name: 'Nya koncept', icon: '📦📦', supportsConceptAttachment: true, maxConcepts: 10 },
  { id: 'gameplan_updated', name: 'Game Plan uppdaterad', icon: '📋', supportsConceptAttachment: true, maxConcepts: 5 },
  { id: 'gameplan_summary', name: 'Game Plan-sammanfattning', icon: '🗺️', supportsConceptAttachment: true, maxConcepts: 3 },
  { id: 'weekly_summary', name: 'Veckosammanfattning', icon: '📊', supportsConceptAttachment: false },
  { id: 'custom', name: 'Anpassat email', icon: '✉️', supportsConceptAttachment: true, maxConcepts: 10 },
];

export type HydratedEmailPayload = {
  payload: SendEmailPayload;
  customer: CustomerData;
  rendered: EmailTemplateResult;
  conceptIds: string[];
  toEmail: string;
};

type CustomerConceptEmailRow = {
  id: string;
  concept_id: string | null;
  match_percentage: number | null;
  why_it_fits: string | null;
  content_overrides: Record<string, unknown> | null;
  tiktok_thumbnail_url: string | null;
};

type WeeklySummaryConceptRow = CustomerConceptEmailRow & {
  added_at: string | null;
  produced_at: string | null;
  published_at: string | null;
  tiktok_url: string | null;
  tiktok_views: number | null;
  reconciled_customer_concept_id?: string | null;
};

type WeeklySummaryNoteRow = {
  id: string;
  content: string | null;
  created_at: string | null;
};

function buildDashboardUrl(customerId?: string): string {
  const url = new URL('/', getAppUrl());
  if (customerId) {
    url.searchParams.set('customer', customerId);
  }
  return url.toString();
}

async function loadCustomer(customerId: string): Promise<CustomerData> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('id, business_name, contact_email, customer_contact_name')
    .eq('id', customerId)
    .single();

  if (error || !data?.contact_email) {
    throw new Error(error?.message || 'Customer email missing');
  }

  const parsedEmail = emailAddressSchema.safeParse(data.contact_email);
  if (!parsedEmail.success) {
    throw new Error('Customer email missing');
  }

  return {
    id: data.id,
    business_name: data.business_name || '',
    contact_email: parsedEmail.data,
    customer_contact_name: data.customer_contact_name || undefined,
  };
}

function buildConceptDataFromRow(row: CustomerConceptEmailRow): ConceptData {
  const baseConcept = row.concept_id ? loadConceptById(row.concept_id) : undefined;
  const overrides = resolveCustomerConceptContentOverrides({
    content_overrides: row.content_overrides,
  });
  const headline = overrides.headline || baseConcept?.headline || 'Koncept';
  const headlineSv = overrides.headline || baseConcept?.headline_sv || baseConcept?.headline || undefined;
  const whyItWorks = overrides.why_it_fits
    || row.why_it_fits
    || baseConcept?.whyItWorks_sv
    || baseConcept?.whyItFits_sv?.[0]
    || undefined;

  return {
    id: row.id,
    headline,
    headline_sv: headlineSv,
    matchPercentage: row.match_percentage ?? baseConcept?.matchPercentage ?? 85,
    whyItWorks,
    whyItWorks_sv: whyItWorks,
    thumbnail_url: row.tiktok_thumbnail_url || null,
  };
}

function buildWeeklyClipDataFromRow(
  row: WeeklySummaryConceptRow,
  fallbackTitle: string
): WeeklySummaryClipData {
  const concept = buildConceptDataFromRow(row);
  const hasRealConceptTitle = Boolean(row.concept_id);
  const title = hasRealConceptTitle
    ? (concept.headline_sv || concept.headline)
    : fallbackTitle;
  const statusDate = row.published_at || row.produced_at;

  return {
    id: row.id,
    title,
    thumbnail_url: row.tiktok_thumbnail_url || null,
    url: row.tiktok_url || null,
    views: row.tiktok_views,
    publishedAt: row.published_at,
    producedAt: row.produced_at,
    statusLabel: statusDate
      ? `${row.published_at ? 'Publicerad' : 'Producerad'} ${formatShortDateSv(statusDate)}`
      : undefined,
  };
}

async function hydrateConcepts(customerId: string, conceptIds: string[]): Promise<ConceptData[]> {
  if (conceptIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('customer_concepts')
    .select('id, concept_id, match_percentage, why_it_fits, content_overrides, tiktok_thumbnail_url')
    .eq('customer_profile_id', customerId)
    .in('id', conceptIds);

  if (error) {
    throw new Error(error.message);
  }

  const rowsById = new Map<string, CustomerConceptEmailRow>(
    ((data || []) as CustomerConceptEmailRow[]).map((row) => [row.id, row])
  );
  const concepts: ConceptData[] = [];

  for (const conceptId of conceptIds) {
    const row = rowsById.get(conceptId);
    if (!row) {
      continue;
    }

    concepts.push(buildConceptDataFromRow(row));
  }

  return concepts;
}

async function buildWeeklySummaryData(
  customerId: string,
  explicit?: WeeklySummaryData,
  attachedConceptCount = 0
): Promise<WeeklySummaryData> {
  const supabase = createSupabaseAdmin();
  const preferences = normalizeWeeklySummaryPreferences(
    explicit?.preferences as Record<string, unknown> | null | undefined
  );
  const previousWeek = getPreviousWeekRange();
  const startIso = previousWeek.start.toISOString();
  const endIso = previousWeek.end.toISOString();

  const [
    { count: totalConceptCount, error: totalCountError },
    { data: newConceptRows, count: newConceptCount, error: newConceptsError },
    { data: producedRows, count: producedCount, error: producedError },
    { data: publishedRows, count: publishedCount, error: publishedError },
    { data: noteRows, error: notesError },
  ] = await Promise.all([
    supabase
      .from('customer_concepts')
      .select('id', { count: 'exact', head: true })
      .eq('customer_profile_id', customerId)
      .not('concept_id', 'is', null),
    supabase
      .from('customer_concepts')
      .select('id, concept_id, match_percentage, why_it_fits, content_overrides, tiktok_thumbnail_url, added_at', { count: 'exact' })
      .eq('customer_profile_id', customerId)
      .not('concept_id', 'is', null)
      .gte('added_at', startIso)
      .lte('added_at', endIso)
      .order('added_at', { ascending: false })
      .limit(preferences.maxConcepts),
    supabase
      .from('customer_concepts')
      .select('id, concept_id, match_percentage, why_it_fits, content_overrides, tiktok_thumbnail_url, tiktok_url, tiktok_views, produced_at, published_at', { count: 'exact' })
      .eq('customer_profile_id', customerId)
      .not('concept_id', 'is', null)
      .gte('produced_at', startIso)
      .lte('produced_at', endIso)
      .order('produced_at', { ascending: false })
      .limit(preferences.maxClips),
    supabase
      .from('customer_concepts')
      .select('id, concept_id, match_percentage, why_it_fits, content_overrides, tiktok_thumbnail_url, tiktok_url, tiktok_views, produced_at, published_at, reconciled_customer_concept_id', { count: 'exact' })
      .eq('customer_profile_id', customerId)
      .gte('published_at', startIso)
      .lte('published_at', endIso)
      .order('published_at', { ascending: false })
      .limit(preferences.maxClips * 2),
    supabase
      .from('customer_notes')
      .select('id, content, created_at')
      .eq('customer_id', customerId)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(preferences.maxNotes),
  ]);

  const firstError = totalCountError || newConceptsError || producedError || publishedError || notesError;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const newConcepts = ((newConceptRows || []) as Array<CustomerConceptEmailRow & { added_at: string | null }>)
    .map((row) => buildConceptDataFromRow(row));
  const producedClips = ((producedRows || []) as WeeklySummaryConceptRow[])
    .map((row) => buildWeeklyClipDataFromRow(row, 'Producerat klipp'));

  const publishedClips = ((publishedRows || []) as WeeklySummaryConceptRow[])
    .filter((row) => !(row.concept_id === null && row.reconciled_customer_concept_id))
    .slice(0, preferences.maxClips)
    .map((row) => buildWeeklyClipDataFromRow(row, 'Publicerat klipp'));

  const cmThoughts: WeeklySummaryNoteData[] = ((noteRows || []) as WeeklySummaryNoteRow[])
    .filter((note) => typeof note.content === 'string' && note.content.trim().length > 0)
    .map((note) => ({
      id: note.id,
      content: note.content!.trim(),
      created_at: note.created_at,
    }));

  return {
    weekNum: explicit?.weekNum ?? previousWeek.weekNum,
    conceptsAdded: explicit?.conceptsAdded ?? newConceptCount ?? attachedConceptCount,
    totalConcepts: explicit?.totalConcepts ?? totalConceptCount ?? attachedConceptCount,
    producedCount: explicit?.producedCount ?? producedCount ?? producedClips.length,
    publishedClipCount: explicit?.publishedClipCount ?? publishedCount ?? publishedClips.length,
    newConcepts,
    newClips: publishedClips,
    producedClips,
    cmThoughts,
    preferences,
  };
}

async function loadGamePlanData(customerId: string, explicit?: SendEmailPayload['gameplan']): Promise<SendEmailPayload['gameplan']> {
  if (explicit && (explicit.title || explicit.description || (explicit.goals?.length ?? 0) > 0)) {
    return explicit;
  }

  const supabase = createSupabaseAdmin();
  const [{ data: customerProfile }, { data: gamePlanRecord }] = await Promise.all([
    supabase
      .from('customer_profiles')
      .select('game_plan')
      .eq('id', customerId)
      .maybeSingle(),
    supabase
      .from('customer_game_plans')
      .select('customer_id, html, plain_text, editor_version, updated_by, created_at, updated_at')
      .eq('customer_id', customerId)
      .maybeSingle(),
  ]);

  const resolved = resolveGamePlanDocument(gamePlanRecord, customerProfile?.game_plan);
  const extracted = extractGamePlanEmailData({
    html: resolved.html,
    plain_text: resolved.plainText,
  });

  if (!extracted.title && !extracted.description && (extracted.goals?.length ?? 0) === 0) {
    return explicit;
  }

  return {
    title: explicit?.title || extracted.title,
    description: explicit?.description || extracted.description,
    goals: explicit?.goals?.length ? explicit.goals : extracted.goals,
  };
}

function getPlaceholderValues(
  customer: CustomerData,
  conceptCount: number,
  weeklySummary?: WeeklySummaryData
): Record<string, string | number | undefined> {
  const countText = numberToSwedish(conceptCount);
  return {
    business_name: customer.business_name || 'er verksamhet',
    count: conceptCount,
    count_capitalized: countText.charAt(0).toUpperCase() + countText.slice(1),
    contact_name: customer.customer_contact_name ? ` ${customer.customer_contact_name}` : '',
    week: weeklySummary?.weekNum,
  };
}

export async function hydrateEmailPayload(input: unknown): Promise<HydratedEmailPayload> {
  const payload = sendEmailPayloadSchema.parse(input);
  const conceptIds = Array.from(new Set(payload.concept_ids || []));
  const customer = await loadCustomer(payload.customer_id);
  const concepts = await hydrateConcepts(payload.customer_id, conceptIds);
  const gameplan = payload.email_type === 'gameplan_updated' || payload.email_type === 'gameplan_summary'
    ? await loadGamePlanData(payload.customer_id, payload.gameplan)
    : payload.gameplan;
  const weeklySummary = payload.email_type === 'weekly_summary'
    ? await buildWeeklySummaryData(payload.customer_id, payload.weekly_summary as WeeklySummaryData | undefined, concepts.length)
    : undefined;
  const placeholderValues = getPlaceholderValues(customer, concepts.length, weeklySummary);

  if (payload.body_html && !payload.email_type) {
    return {
      payload,
      customer,
      conceptIds,
      toEmail: customer.contact_email,
      rendered: {
        subject: payload.subject || 'LeTrend',
        html: payload.body_html,
        text: htmlToText(payload.body_html),
      },
    };
  }

  const rendered = buildEmailContent(
    payload.email_type || 'custom',
    customer,
    {
      concepts,
      gameplan,
      intro: payload.intro ? replaceTemplatePlaceholders(payload.intro, placeholderValues) : undefined,
      outro: payload.outro ? replaceTemplatePlaceholders(payload.outro, placeholderValues) : undefined,
      subject: payload.subject ? replaceTemplatePlaceholders(payload.subject, placeholderValues) : undefined,
      weeklySummary,
    },
    { dashboardUrl: buildDashboardUrl(customer.id) }
  );

  return {
    payload,
    customer,
    conceptIds,
    toEmail: customer.contact_email,
    rendered,
  };
}
