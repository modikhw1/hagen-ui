import type { CustomerData, WeeklySummaryPreferences } from './types';

export const DEFAULT_EMAIL_URL = 'https://letrend.se';
export const DEFAULT_WEEKLY_SUMMARY_PREFERENCES: WeeklySummaryPreferences = {
  includeNewConcepts: true,
  includeNewClips: true,
  includeProducedClips: true,
  includeClipMetrics: true,
  includeCmThoughts: true,
  maxConcepts: 4,
  maxClips: 4,
  maxNotes: 3,
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function replaceLineBreaks(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br />');
}

export function contactGreetingName(customer: CustomerData): string {
  const preferredName = customer.customer_contact_name || customer.contact_name;
  return preferredName?.trim() ? ` ${preferredName.trim()}` : '';
}

export function resolveBusinessName(customer: CustomerData): string {
  return customer.business_name?.trim() || 'er verksamhet';
}

export function getWeekNumber(date = new Date()): number {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function getPreviousWeekRange(referenceDate = new Date()): {
  weekNum: number;
  start: Date;
  end: Date;
} {
  const utcDate = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate()
  ));
  const dayNum = utcDate.getUTCDay() || 7;
  const currentWeekStart = new Date(utcDate);
  currentWeekStart.setUTCDate(utcDate.getUTCDate() - dayNum + 1);
  currentWeekStart.setUTCHours(0, 0, 0, 0);

  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setUTCDate(currentWeekStart.getUTCDate() - 7);

  const previousWeekEnd = new Date(currentWeekStart);
  previousWeekEnd.setUTCMilliseconds(-1);

  return {
    weekNum: getWeekNumber(previousWeekStart),
    start: previousWeekStart,
    end: previousWeekEnd,
  };
}

export function normalizeWeeklySummaryPreferences(
  value: Record<string, unknown> | WeeklySummaryPreferences | null | undefined
): WeeklySummaryPreferences {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};

  const readBoolean = (key: keyof WeeklySummaryPreferences, fallback: boolean): boolean => (
    typeof record[key] === 'boolean' ? record[key] as boolean : fallback
  );
  const readCount = (key: keyof WeeklySummaryPreferences, fallback: number, max: number): number => {
    const raw = record[key];
    return typeof raw === 'number' && Number.isFinite(raw)
      ? Math.max(1, Math.min(max, Math.round(raw)))
      : fallback;
  };

  return {
    includeNewConcepts: readBoolean('includeNewConcepts', DEFAULT_WEEKLY_SUMMARY_PREFERENCES.includeNewConcepts),
    includeNewClips: readBoolean('includeNewClips', DEFAULT_WEEKLY_SUMMARY_PREFERENCES.includeNewClips),
    includeProducedClips: readBoolean('includeProducedClips', DEFAULT_WEEKLY_SUMMARY_PREFERENCES.includeProducedClips),
    includeClipMetrics: readBoolean('includeClipMetrics', DEFAULT_WEEKLY_SUMMARY_PREFERENCES.includeClipMetrics),
    includeCmThoughts: readBoolean('includeCmThoughts', DEFAULT_WEEKLY_SUMMARY_PREFERENCES.includeCmThoughts),
    maxConcepts: readCount('maxConcepts', DEFAULT_WEEKLY_SUMMARY_PREFERENCES.maxConcepts, 10),
    maxClips: readCount('maxClips', DEFAULT_WEEKLY_SUMMARY_PREFERENCES.maxClips, 10),
    maxNotes: readCount('maxNotes', DEFAULT_WEEKLY_SUMMARY_PREFERENCES.maxNotes, 10),
  };
}

export function formatCompactNumberSv(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0';
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace('.', ',')}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace('.', ',')}k`;
  }

  return String(Math.round(value));
}

export function formatShortDateSv(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
  });
}

export function numberToSwedish(value: number): string {
  switch (value) {
    case 0:
      return 'noll';
    case 1:
      return 'ett';
    case 2:
      return 'två';
    case 3:
      return 'tre';
    case 4:
      return 'fyra';
    case 5:
      return 'fem';
    case 6:
      return 'sex';
    case 7:
      return 'sju';
    case 8:
      return 'åtta';
    case 9:
      return 'nio';
    case 10:
      return 'tio';
    default:
      return String(value);
  }
}

export function replaceTemplatePlaceholders(
  template: string,
  values: Record<string, string | number | null | undefined>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, rawKey: string) => {
    const value = values[rawKey];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|li)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
