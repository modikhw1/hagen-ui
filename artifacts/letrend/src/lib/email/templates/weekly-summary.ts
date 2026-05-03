import { bodyText, clipStatusCard, cmThoughtCard, conceptCard, sectionHeading, statBox } from '../components';
import { contactGreetingName, getPreviousWeekRange, normalizeWeeklySummaryPreferences, resolveBusinessName } from '../helpers';
import type { CustomerData, EmailTemplateData, RenderedTemplate } from '../types';

export function renderWeeklySummaryTemplate(
  customer: CustomerData,
  data: EmailTemplateData
): RenderedTemplate {
  const summary = data.weeklySummary;
  const preferences = normalizeWeeklySummaryPreferences(summary?.preferences);
  const concepts = summary?.newConcepts || data.concepts || [];
  const newClips = summary?.newClips || [];
  const producedClips = summary?.producedClips || [];
  const cmThoughts = summary?.cmThoughts || [];
  const previousWeek = getPreviousWeekRange();
  const weekNum = summary?.weekNum ?? previousWeek.weekNum;
  const conceptsAdded = summary?.conceptsAdded ?? concepts.length;
  const producedCount = summary?.producedCount ?? producedClips.length;
  const publishedClipCount = summary?.publishedClipCount ?? newClips.length;
  const businessName = resolveBusinessName(customer);
  const greetingName = contactGreetingName(customer);
  const intro = data.intro?.trim()
    ? data.intro
    : `Hej${greetingName}! Här är en sammanfattning av veckan för ${businessName}.`;
  const outro = data.outro?.trim() ? data.outro : 'Tack för ett bra samarbete!';

  return {
    subject: data.subject?.trim() || 'Veckouppdatering - LeTrend',
    contentHtml: [
      sectionHeading(`Vecka ${weekNum} som gick`),
      bodyText(intro),
      `<div style="margin: 20px 0; font-size: 0; white-space: nowrap;">
        ${statBox(conceptsAdded, 'Nya koncept', '#10b981')}
        <div style="display: inline-block; width: 16px;"></div>
        ${statBox(producedCount, 'Producerade', '#6B4423')}
      </div>`,
      `<div style="margin: 0 0 24px; font-size: 0; white-space: nowrap;">
        ${statBox(publishedClipCount, 'Publicerade klipp', '#8B5A2B')}
        <div style="display: inline-block; width: 16px;"></div>
        ${statBox(summary?.totalConcepts ?? 0, 'Totalt i plan', '#5D4D3D')}
      </div>`,
      preferences.includeNewConcepts
        ? (concepts.length > 0
          ? `<h3 style="margin: 20px 0 10px; font-family: Georgia, serif; font-size: 16px; color: #1A1612;">Nya koncept</h3>${concepts.map((concept, index) => conceptCard(concept, index + 1)).join('')}`
          : bodyText('Inga nya koncept lades till under veckan.', 'left'))
        : '',
      preferences.includeProducedClips
        ? (producedClips.length > 0
          ? `<h3 style="margin: 24px 0 10px; font-family: Georgia, serif; font-size: 16px; color: #1A1612;">Nya producerade klipp</h3>${producedClips.map((clip) => clipStatusCard(clip, { showMetrics: preferences.includeClipMetrics })).join('')}`
          : bodyText('Inga nya klipp markerades som producerade under veckan.', 'left'))
        : '',
      preferences.includeNewClips
        ? (newClips.length > 0
          ? `<h3 style="margin: 24px 0 10px; font-family: Georgia, serif; font-size: 16px; color: #1A1612;">Nya publicerade klipp</h3>${newClips.map((clip) => clipStatusCard(clip, { showMetrics: preferences.includeClipMetrics })).join('')}`
          : bodyText('Inga nya klipp publicerades under veckan.', 'left'))
        : '',
      preferences.includeCmThoughts
        ? (cmThoughts.length > 0
          ? `<h3 style="margin: 24px 0 10px; font-family: Georgia, serif; font-size: 16px; color: #1A1612;">Tankar från din CM</h3>${cmThoughts.map((note) => cmThoughtCard(note)).join('')}`
          : bodyText('Inga nya kommentarer från din CM den här veckan.', 'left'))
        : '',
      bodyText(outro),
    ].join(''),
  };
}
