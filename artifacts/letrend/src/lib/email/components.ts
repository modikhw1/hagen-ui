import type { ConceptData, WeeklySummaryClipData, WeeklySummaryNoteData } from './types';
import { escapeHtml, formatCompactNumberSv, formatShortDateSv, replaceLineBreaks } from './helpers';

export function sectionHeading(text: string): string {
  return `<h2 style="margin: 0 0 16px; font-family: Georgia, serif; font-size: 22px; font-weight: 400; line-height: 1.3; text-align: center; color: #1A1612;">${escapeHtml(text)}</h2>`;
}

export function bodyText(text: string, align: 'left' | 'center' = 'center'): string {
  return `<p style="margin: 0 0 24px; color: #5D4D3D; font-size: 16px; line-height: 1.7; text-align: ${align};">${replaceLineBreaks(text)}</p>`;
}

export function conceptCard(concept: ConceptData, index?: number): string {
  const titlePrefix = typeof index === 'number' ? `${index}. ` : '';
  const title = concept.headline_sv || concept.headline;
  const whyItWorks = concept.whyItWorks_sv || concept.whyItWorks;
  const thumbnail = concept.thumbnail_url?.trim();

  return `<div style="background: #FAF8F5; border-radius: 12px; overflow: hidden; margin: 16px 0; border: 1px solid #E8E0D8;">
    ${thumbnail ? `<img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(title)}" style="display: block; width: 100%; height: 160px; object-fit: cover;" />` : ''}
    <div style="padding: 20px;">
      <div style="margin-bottom: 8px; font-family: Georgia, serif; font-size: 18px; color: #1A1612;">${escapeHtml(titlePrefix)}${escapeHtml(title)}</div>
      ${whyItWorks ? `<p style="margin: 0 0 12px; color: #5D4D3D; font-size: 14px; line-height: 1.5;">${replaceLineBreaks(whyItWorks)}</p>` : ''}
      <span style="display: inline-block; background: #10b981; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 12px;">${escapeHtml(String(concept.matchPercentage))}% matchning</span>
    </div>
  </div>`;
}

export function statBox(value: string | number, label: string, color: string): string {
  return `<div style="display: inline-block; width: calc(50% - 10px); vertical-align: top; background: #FAF8F5; border-radius: 12px; padding: 20px; text-align: center; border: 1px solid #E8E0D8; box-sizing: border-box;">
    <div style="font-size: 32px; font-weight: 700; color: ${escapeHtml(color)};">${escapeHtml(String(value))}</div>
    <div style="color: #5D4D3D; font-size: 14px;">${escapeHtml(label)}</div>
  </div>`;
}

export function gamePlanHighlight(title: string, description?: string): string {
  return `<div style="background: #FAF8F5; border-radius: 12px; padding: 20px; margin: 16px 0; border: 1px solid #E8E0D8;">
    <div style="margin-bottom: 8px; font-family: Georgia, serif; font-size: 18px; color: #1A1612;">${escapeHtml(title)}</div>
    ${description ? `<p style="margin: 0; color: #5D4D3D; font-size: 14px; line-height: 1.5;">${replaceLineBreaks(description)}</p>` : ''}
  </div>`;
}

export function goalsBox(goals: string[]): string {
  const goalItems = goals
    .map((goal, index) => `<li style="margin: 0 0 10px; color: #5D4D3D; font-size: 14px; line-height: 1.5;"><strong style="color: #1A1612;">${index + 1}.</strong> ${escapeHtml(goal)}</li>`)
    .join('');

  return `<div style="background: #FAF8F5; border-radius: 12px; padding: 20px; margin: 16px 0; border: 1px solid #E8E0D8;">
    <div style="margin-bottom: 12px; font-family: Georgia, serif; font-size: 16px; font-weight: 600; color: #1A1612;">Fokusområden</div>
    <ol style="margin: 0; padding-left: 0; list-style: none;">
      ${goalItems}
    </ol>
  </div>`;
}

export function clipStatusCard(
  clip: WeeklySummaryClipData,
  options?: { showMetrics?: boolean }
): string {
  const showMetrics = options?.showMetrics !== false;
  const metricsLabel = showMetrics && typeof clip.views === 'number'
    ? `${formatCompactNumberSv(clip.views)} visningar`
    : '';
  const metaParts = [clip.statusLabel, metricsLabel].filter(Boolean);
  const linkHtml = clip.url
    ? `<a href="${escapeHtml(clip.url)}" style="color: #6B4423; font-size: 12px; font-weight: 600; text-decoration: none;">Öppna klipp</a>`
    : '';

  return `<div style="background: #FAF8F5; border-radius: 12px; overflow: hidden; margin: 16px 0; border: 1px solid #E8E0D8;">
    ${clip.thumbnail_url ? `<img src="${escapeHtml(clip.thumbnail_url)}" alt="${escapeHtml(clip.title)}" style="display: block; width: 100%; height: 160px; object-fit: cover;" />` : ''}
    <div style="padding: 20px;">
      <div style="margin-bottom: 8px; font-family: Georgia, serif; font-size: 18px; color: #1A1612;">${escapeHtml(clip.title)}</div>
      ${metaParts.length > 0 ? `<p style="margin: 0 0 12px; color: #5D4D3D; font-size: 14px; line-height: 1.5;">${escapeHtml(metaParts.join(' · '))}</p>` : ''}
      ${linkHtml}
    </div>
  </div>`;
}

export function cmThoughtCard(note: WeeklySummaryNoteData): string {
  const dateLabel = formatShortDateSv(note.created_at);

  return `<div style="background: #FAF8F5; border-radius: 12px; padding: 18px 20px; margin: 12px 0; border: 1px solid #E8E0D8;">
    ${dateLabel ? `<div style="margin-bottom: 8px; color: #9D8E7D; font-size: 12px; font-weight: 600;">${escapeHtml(dateLabel)}</div>` : ''}
    <p style="margin: 0; color: #5D4D3D; font-size: 14px; line-height: 1.6;">${replaceLineBreaks(note.content)}</p>
  </div>`;
}
