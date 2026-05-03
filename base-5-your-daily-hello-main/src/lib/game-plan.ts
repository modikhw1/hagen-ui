import type { RawGamePlanNote } from '@/components/gameplan-editor/utils/legacy-converter';
import { gamePlanNotesToHtml } from '@/components/gameplan-editor/utils/legacy-converter';
import { sanitizeRichTextHtml, stripHtml } from '@/components/gameplan-editor/utils/sanitize';
import {
  detectLinkType,
  getHostname,
  normalizeHref,
  toLinkPlatform,
  type LinkPlatform,
} from '@/components/gameplan-editor/utils/link-helpers';
import type { CustomerGamePlanSummary } from '@/types/studio-v2';

export interface LegacyGamePlanBlob {
  html?: string;
  notes?: RawGamePlanNote[];
  version?: number;
  updated_at?: string;
}

export interface CustomerGamePlanRecord {
  customer_id: string;
  html: string;
  plain_text: string;
  editor_version: number;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ResolvedGamePlanDocument {
  html: string;
  plainText: string;
  updatedAt: string | null;
  editorVersion: number;
  hasGamePlan: boolean;
  source: 'customer_game_plans' | 'legacy_customer_profiles' | 'empty';
}

export interface GamePlanDocumentResponse {
  game_plan: CustomerGamePlanSummary;
  has_game_plan: boolean;
}

export interface GamePlanGenerateInput {
  customer_name: string;
  niche: string;
  audience: string;
  platform: string;
  tone: string;
  constraints: string;
  focus: string;
  references: GamePlanReferenceInput[];
  images: GamePlanImageInput[];
  notes: string[];
}

export interface GamePlanReferenceInput {
  url: string;
  label?: string;
  note?: string;
  platform?: LinkPlatform;
}

export interface GamePlanImageInput {
  url: string;
  caption?: string;
}

export interface ExtractedGamePlanEmailData {
  title?: string;
  description?: string;
  goals?: string[];
}

function asLegacyGamePlan(value: unknown): LegacyGamePlanBlob | null {
  if (!value || typeof value !== 'object') return null;
  return value as LegacyGamePlanBlob;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripCodeFence(value: string): string {
  const fenceMatch = value.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  return value.trim();
}

function parseAttributeString(input: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([a-zA-Z0-9_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

  for (const match of input.matchAll(pattern)) {
    const key = match[1]?.toLowerCase();
    const value = match[3] ?? match[4] ?? '';
    if (key) {
      attributes[key] = value;
    }
  }

  return attributes;
}

function extractFirstImageAttributes(fragment: string): Record<string, string> | null {
  const match = fragment.match(/<img\b([^>]*)\/?>/i);
  if (!match) return null;
  return parseAttributeString(match[1] || '');
}

function extractFigureCaption(fragment: string): string {
  const captionMatch = fragment.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
  return normalizeGamePlanLine(stripHtml(captionMatch?.[1] || ''));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeGamePlanLine(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\s+/g, ' ')
    .replace(/^[\-\*\u2022]\s*/, '')
    .trim();
}

function htmlFragmentToLines(fragment: string): string[] {
  return decodeHtmlEntities(
    fragment
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|li|ul|ol|blockquote|figure|figcaption)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
  )
    .split(/\n+/)
    .map(normalizeGamePlanLine)
    .filter(Boolean);
}

function plainTextToLines(value: string): string[] {
  return decodeHtmlEntities(value)
    .split(/\r?\n+/)
    .map(normalizeGamePlanLine)
    .filter(Boolean);
}

function trimSummary(value: string, maxLength = 260): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function isGoalHeading(value: string): boolean {
  return /(fokus|m[a\u00e5]l|prioritet|n[a\u00e4]sta steg|strategi|riktning|checklista|att g[o\u00f6]ra|leverans)/i.test(value);
}

function isMetaHeading(value: string): boolean {
  return /(kundprofil|bakgrund|sammanfattning|o[v\u00f6]ersikt|ton|r[o\u00f6]st|begr[a\u00e4]nsningar|referenser|visuell riktning)/i.test(value);
}

function dedupeLines(values: string[], maxItems = 5): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.toLowerCase();
    if (!value || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(value);
    if (deduped.length >= maxItems) break;
  }

  return deduped;
}

function buildDescriptionCandidate(lines: string[]): string | undefined {
  if (lines.length === 0) return undefined;
  const candidate = lines.slice(0, 2).join(' ');
  return candidate ? trimSummary(candidate) : undefined;
}

function extractSectionBlocks(html: string): Array<{ heading: string; lines: string[] }> {
  const sections: Array<{ heading: string; lines: string[] }> = [];
  const headingPattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const matches = Array.from(html.matchAll(headingPattern));

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextMatch = matches[index + 1];
    const heading = normalizeGamePlanLine(stripHtml(match[2] || ''));
    if (!heading) continue;

    const bodyStart = (match.index || 0) + match[0].length;
    const bodyEnd = nextMatch?.index ?? html.length;
    const lines = htmlFragmentToLines(html.slice(bodyStart, bodyEnd));
    sections.push({ heading, lines });
  }

  return sections;
}

function renderLinkChipIconHtml(platform: LinkPlatform): string {
  if (platform === 'tiktok') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" /></svg>';
  }
  if (platform === 'instagram') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>';
  }
  if (platform === 'youtube') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 00.5 6.19 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.81 3.02 3.02 0 002.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 002.12-2.14A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.81zM9.55 15.5V8.5l6.27 3.5-6.27 3.5z" /></svg>';
  }
  if (platform === 'article') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>';
  }
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>';
}

export function renderLinkChipHtml(rawHref: string, rawLabel?: string, rawPlatform?: string): string {
  const href = normalizeHref(rawHref);
  if (!href) return '';

  const platform = rawPlatform ? toLinkPlatform(rawPlatform) : detectLinkType(href);
  const label = (rawLabel || '').trim() || getHostname(href) || href;

  return [
    '<span data-type="linkChip" style="display:inline;">',
    `<a class="gp-link-chip gp-link-chip--${platform}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" data-gp-chip="1" data-platform="${platform}" data-label="${escapeHtml(label)}">`,
    `<span class="gp-link-chip__icon" aria-hidden="true">${renderLinkChipIconHtml(platform)}</span>`,
    `<span class="gp-link-chip__label">${escapeHtml(label)}</span>`,
    '</a>',
    '</span>',
  ].join('');
}

export function renderImageFigureHtml(rawSrc: string, rawCaption?: string): string {
  const src = normalizeHref(rawSrc);
  if (!src) return '';
  const caption = (rawCaption || '').trim();

  return [
    '<figure class="gp-image" data-width="100" style="width:100%">',
    `<img src="${escapeHtml(src)}" alt="${escapeHtml(caption || 'Game Plan image')}" loading="lazy" />`,
    `<figcaption>${escapeHtml(caption)}</figcaption>`,
    '</figure>',
  ].join('');
}

export function renderImageGalleryHtml(items: Array<{ src: string; caption?: string }>): string {
  const images = items
    .map((item) => ({
      src: normalizeHref(item.src),
      caption: (item.caption || '').trim(),
    }))
    .filter((item) => item.src);

  if (!images.length) return '';

  const columns = Math.max(1, Math.min(images.length, 3));

  return [
    `<div class="gp-image-grid" style="display:grid;grid-template-columns:repeat(${columns}, 1fr);gap:8px;margin-bottom:12px">`,
    ...images.map((image) => [
      '<div data-gp-image-item="1">',
      `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.caption || 'Game Plan image')}" loading="lazy" style="width:100%;aspect-ratio:4 / 3;object-fit:cover;border-radius:6px;display:block" />`,
      `<div class="gp-image-grid__caption">${escapeHtml(image.caption)}</div>`,
      '</div>',
    ].join('')),
    '</div>',
  ].join('');
}

function convertAiCustomElementsToGamePlanHtml(input: string): string {
  let output = stripCodeFence(input)
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?(html|body)\b[^>]*>/gi, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '');

  output = output.replace(/<image-gallery\b[^>]*>([\s\S]*?)<\/image-gallery>/gi, (_full, inner) => {
    const items: Array<{ src: string; caption?: string }> = [];

    for (const match of inner.matchAll(/<image-item\b([^>]*)\/?>/gi)) {
      const attrs = parseAttributeString(match[1] || '');
      if (attrs.src) {
        items.push({ src: attrs.src, caption: attrs.caption || '' });
      }
    }

    return renderImageGalleryHtml(items);
  });

  output = output.replace(/<image-figure\b([^>]*)>([\s\S]*?)<\/image-figure>/gi, (_full, attrString, inner) => {
    const attrs = parseAttributeString(attrString || '');
    const caption = attrs.caption || stripHtml(inner || '');
    return renderImageFigureHtml(attrs.src || '', caption);
  });

  output = output.replace(/<image-figure\b([^>]*)\/>/gi, (_full, attrString) => {
    const attrs = parseAttributeString(attrString || '');
    return renderImageFigureHtml(attrs.src || '', attrs.caption || '');
  });

  output = output.replace(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi, (_full, inner) => {
    const imageAttrs = extractFirstImageAttributes(inner || '');
    if (!imageAttrs?.src) {
      return inner || '';
    }

    const caption =
      extractFigureCaption(inner || '')
      || normalizeGamePlanLine(imageAttrs.caption || '')
      || normalizeGamePlanLine(imageAttrs.alt || '');

    return renderImageFigureHtml(imageAttrs.src, caption);
  });

  output = output.replace(/<a\b[^>]*>\s*(<img\b[^>]*\/?>)\s*<\/a>/gi, (_full, imageTag) => {
    const imageAttrs = extractFirstImageAttributes(imageTag);
    if (!imageAttrs?.src) return '';
    const caption = normalizeGamePlanLine(imageAttrs.caption || '') || normalizeGamePlanLine(imageAttrs.alt || '');
    return renderImageFigureHtml(imageAttrs.src, caption);
  });

  output = output.replace(/(<img\b[^>]*\/?>)\s*<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi, (_full, imageTag, captionHtml) => {
    const imageAttrs = extractFirstImageAttributes(imageTag);
    if (!imageAttrs?.src) return '';
    const caption = normalizeGamePlanLine(stripHtml(captionHtml || ''))
      || normalizeGamePlanLine(imageAttrs.caption || '')
      || normalizeGamePlanLine(imageAttrs.alt || '');
    return renderImageFigureHtml(imageAttrs.src, caption);
  });

  output = output.replace(/<link-chip\b([^>]*)>([\s\S]*?)<\/link-chip>/gi, (_full, attrString, inner) => {
    const attrs = parseAttributeString(attrString || '');
    const label = attrs.label || stripHtml(inner || '');
    return renderLinkChipHtml(attrs.url || attrs.href || '', label, attrs.platform);
  });

  output = output.replace(/<link-chip\b([^>]*)\/>/gi, (_full, attrString) => {
    const attrs = parseAttributeString(attrString || '');
    return renderLinkChipHtml(attrs.url || attrs.href || '', attrs.label || '', attrs.platform);
  });

  output = output.replace(/<h[1-6]\b[^>]*>/gi, '<h3>');
  output = output.replace(/<\/h[1-6]>/gi, '</h3>');
  output = output.replace(/<img\b([^>]*)\/?>/gi, (_full, attrString) => {
    const attrs = parseAttributeString(attrString || '');
    return renderImageFigureHtml(attrs.src || '', attrs.alt || attrs.caption || '');
  });
  output = output.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_full, attrString, inner) => {
    const attrs = parseAttributeString(attrString || '');
    const href = normalizeHref(attrs.href || attrs.url || '');
    const attrLabel = attrs.label || attrs['data-label'] || attrs['aria-label'] || attrs.title || '';
    const label = stripHtml(inner || '').trim() || attrLabel.trim() || getHostname(href) || href;

    if (!href) {
      return escapeHtml(label);
    }

    const platform = detectLinkType(href);
    if (platform === 'external' && label && label !== href) {
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    }

    return renderLinkChipHtml(href, label || undefined, platform);
  });

  output = output
    .replace(/<p>\s*(<figure\b[\s\S]*?<\/figure>)\s*<\/p>/gi, '$1')
    .replace(/<p>\s*(<div class="gp-image-grid"[\s\S]*?<\/div>)\s*<\/p>/gi, '$1')
    .replace(/<p>\s*<\/p>/gi, '');

  return output.trim();
}

export function normalizeAiGeneratedGamePlanHtml(input: string): string {
  return sanitizeRichTextHtml(convertAiCustomElementsToGamePlanHtml(input));
}

function buildParagraph(value: string, fallback: string): string {
  const trimmed = value.trim();
  return `<p>${escapeHtml(trimmed || fallback)}</p>`;
}

function normalizeReferenceInput(reference: GamePlanReferenceInput): GamePlanReferenceInput | null {
  const url = normalizeHref(reference.url || '');
  if (!url) return null;

  const label = (reference.label || '').trim();
  const note = (reference.note || '').trim();

  return {
    url,
    label: label || undefined,
    note: note || undefined,
    platform: reference.platform ? toLinkPlatform(reference.platform) : detectLinkType(url),
  };
}

function normalizeImageInput(image: GamePlanImageInput): GamePlanImageInput | null {
  const url = normalizeHref(image.url || '');
  if (!url) return null;

  const caption = (image.caption || '').trim();
  return {
    url,
    caption: caption || undefined,
  };
}

function normalizeNotesInput(notes: string[]): string[] {
  return notes
    .map((note) => note.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function buildFallbackGeneratedGamePlanHtml(input: GamePlanGenerateInput): string {
  const references = input.references
    .map(normalizeReferenceInput)
    .filter((reference): reference is GamePlanReferenceInput => Boolean(reference));
  const images = input.images
    .map(normalizeImageInput)
    .filter((image): image is GamePlanImageInput => Boolean(image));
  const notes = normalizeNotesInput(input.notes);

  const referenceBlock = references.length > 0
    ? [
      '<h3>Referenser</h3>',
      ...references.map((reference, index) => [
        '<div style="margin-bottom:12px">',
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px">',
        renderLinkChipHtml(reference.url, reference.label || `Referens ${index + 1}`, reference.platform),
        '</div>',
        reference.note ? buildParagraph(reference.note, '') : '',
        '</div>',
      ].join('')),
    ].join('')
    : '';

  const imageBlock = images.length === 1
    ? [
      '<h3>Visuell riktning</h3>',
      renderImageFigureHtml(images[0].url, images[0].caption || 'Referensbild'),
    ].join('')
    : images.length > 1
      ? [
        '<h3>Visuell riktning</h3>',
        renderImageGalleryHtml(
          images.map((image, index) => ({
            src: image.url,
            caption: image.caption || `Referens ${index + 1}`,
          }))
        ),
      ].join('')
      : '';

  const notesBlock = notes.length > 0
    ? [
      '<h3>CM-noter</h3>',
      '<ul>',
      ...notes.map((note) => `<li>${escapeHtml(note)}</li>`),
      '</ul>',
    ].join('')
    : '';

  const profileParts = [
    input.customer_name.trim() ? `${input.customer_name.trim()} ar kunden vi bygger planen for.` : 'Kunden ar fokus for planen.',
    input.niche.trim() ? `Nisch/bransch: ${input.niche.trim()}.` : '',
    input.audience.trim() ? `Malgrupp: ${input.audience.trim()}.` : '',
    input.platform.trim() ? `Primar plattform: ${input.platform.trim()}.` : '',
  ].filter(Boolean).join(' ');

  return sanitizeRichTextHtml([
    '<h3>Kundprofil</h3>',
    buildParagraph(profileParts, 'Beskriv kunden, deras nisch, malgrupp och plattformshistorik.'),
    '<h3>Ton och rost</h3>',
    buildParagraph(input.tone, 'Beskriv vilken kansla innehallet ska ha och vad det inte ska vara.'),
    '<h3>Begransningar</h3>',
    buildParagraph(input.constraints, 'Beskriv vad som alltid eller aldrig ska finnas med i innehallet.'),
    '<h3>Fokus just nu</h3>',
    buildParagraph(input.focus, 'Beskriv den viktigaste strategiska prioriteten for den kommande perioden.'),
    referenceBlock,
    imageBlock,
    notesBlock,
    '<h3>Nasta steg</h3>',
    '<p>Ga igenom planen, markera vad som kanns mest relevant just nu och svara med eventuella justeringar eller fler referenser som vi ska ta vidare.</p>',
  ].join(''));
}

export function buildGamePlanGenerationPrompt(input: GamePlanGenerateInput): string {
  const references = input.references
    .map(normalizeReferenceInput)
    .filter((reference): reference is GamePlanReferenceInput => Boolean(reference));
  const images = input.images
    .map(normalizeImageInput)
    .filter((image): image is GamePlanImageInput => Boolean(image));
  const notes = normalizeNotesInput(input.notes);

  const payload = {
    customer_name: input.customer_name.trim(),
    niche: input.niche.trim(),
    audience: input.audience.trim(),
    platform: input.platform.trim(),
    tone: input.tone.trim(),
    constraints: input.constraints.trim(),
    focus: input.focus.trim(),
    references,
    images,
    notes,
  };

  return [
    'Skapa en svensk Game Plan som HTML for en kund i LeTrend.',
    'Krav:',
    '- Skriv som ett varmt, professionellt brev fran en erfaren content manager.',
    '- Anvand endast H3-rubriker. Aldrig H1 eller H2.',
    '- Max 6 rubriker totalt.',
    '- Returnera endast HTML-fragment, ingen markdown och ingen forklaring.',
    '- Om referenslankar finns: anvand <link-chip url="..." platform="tiktok|instagram|youtube|article|external" label="..."></link-chip>.',
    '- Om en bild finns: anvand <image-figure src="..." caption="..."></image-figure>.',
    '- Om flera bilder finns: anvand <image-gallery><image-item src="..." caption="..." /></image-gallery>.',
    '- Väg in content managerns observationer, smak och arbetsnoter i planen.',
    '- Om en referens har en label ska du behandla den som titel, placeholder eller arbetsrubrik for vad som känns rätt.',
    '- Om en referens har en note ska du oversatta den smaken till tonalitet, struktur, pacing och kreativa rekommendationer i planen.',
    '- Avsluta alltid med en sektion som heter "Nasta steg" eller "Sammanfattning" och uppmanar till dialog.',
    '',
    'Tolkningshjalp:',
    '- En input som "jag tycker att denna profil har en skon ton" betyder att du aktivt ska låta den smaken påverka hela utkastet.',
    '- Referenserna ska inte bara namnges, utan användas for att förstå vilken riktning content managern är ute efter.',
    '',
    'Inputdata:',
    JSON.stringify(payload, null, 2),
  ].join('\n');
}

export function resolveLegacyGamePlan(legacyValue: unknown): ResolvedGamePlanDocument {
  const legacy = asLegacyGamePlan(legacyValue);
  if (!legacy) {
    return {
      html: '',
      plainText: '',
      updatedAt: null,
      editorVersion: 1,
      hasGamePlan: false,
      source: 'empty',
    };
  }

  let html = '';
  if (typeof legacy.html === 'string' && legacy.html.trim()) {
    html = sanitizeRichTextHtml(legacy.html);
  } else if (Array.isArray(legacy.notes) && legacy.notes.length > 0) {
    html = gamePlanNotesToHtml(legacy.notes);
  }

  const plainText = stripHtml(html);

  return {
    html,
    plainText,
    updatedAt: typeof legacy.updated_at === 'string' ? legacy.updated_at : null,
    editorVersion: typeof legacy.version === 'number' ? legacy.version : 1,
    hasGamePlan: Boolean(plainText),
    source: html ? 'legacy_customer_profiles' : 'empty',
  };
}

export function resolveGamePlanDocument(
  record: Partial<CustomerGamePlanRecord> | null | undefined,
  legacyValue?: unknown
): ResolvedGamePlanDocument {
  if (record && typeof record.html === 'string' && record.html.trim()) {
    const html = sanitizeRichTextHtml(record.html);
    const plainText = typeof record.plain_text === 'string' && record.plain_text.trim()
      ? record.plain_text.trim()
      : stripHtml(html);

    return {
      html,
      plainText,
      updatedAt: typeof record.updated_at === 'string' ? record.updated_at : null,
      editorVersion: typeof record.editor_version === 'number' ? record.editor_version : 1,
      hasGamePlan: Boolean(plainText),
      source: 'customer_game_plans',
    };
  }

  return resolveLegacyGamePlan(legacyValue);
}

export function extractGamePlanEmailData(
  summary: Pick<CustomerGamePlanSummary, 'html' | 'plain_text'> | null | undefined
): ExtractedGamePlanEmailData {
  const html = typeof summary?.html === 'string' ? summary.html.trim() : '';
  const plainText = typeof summary?.plain_text === 'string' ? summary.plain_text.trim() : '';

  if (!html && !plainText) {
    return {};
  }

  const sections = html ? extractSectionBlocks(html) : [];
  const leadingHtml = html && sections.length > 0
    ? html.slice(0, html.search(/<h[1-6]\b/i))
    : html;
  const introLines = leadingHtml ? htmlFragmentToLines(leadingHtml) : [];
  const fallbackLines = plainTextToLines(plainText);

  const title = sections[0]?.heading || introLines[0] || fallbackLines[0];

  const descriptionSources = [
    introLines,
    ...sections
      .filter((section) => !isGoalHeading(section.heading))
      .map((section) => section.lines),
    fallbackLines.length > 1 ? [fallbackLines.slice(1).join(' ')] : [],
  ];

  const description = descriptionSources
    .map(buildDescriptionCandidate)
    .find((value) => value && value !== title);

  const goalCandidates = dedupeLines([
    ...sections
      .filter((section) => isGoalHeading(section.heading))
      .flatMap((section) => section.lines),
    ...sections
      .filter((section) => !isMetaHeading(section.heading) && !isGoalHeading(section.heading))
      .flatMap((section) => section.lines.slice(0, 2)),
  ]);

  return {
    title,
    description,
    goals: goalCandidates.length > 0 ? goalCandidates : undefined,
  };
}

export function buildGamePlanSummary(document: ResolvedGamePlanDocument): CustomerGamePlanSummary {
  return {
    html: document.html,
    plain_text: document.plainText,
    updated_at: document.updatedAt,
    editor_version: document.editorVersion,
    source: document.source,
  };
}

export function buildGamePlanDocumentResponse(
  document: ResolvedGamePlanDocument
): GamePlanDocumentResponse {
  return {
    game_plan: buildGamePlanSummary(document),
    has_game_plan: document.hasGamePlan,
  };
}

export function buildGamePlanWritePayload(input: unknown, updatedBy?: string | null) {
  const html = sanitizeRichTextHtml(typeof input === 'string' ? input : '');
  const plainText = stripHtml(html);
  const updatedAt = new Date().toISOString();

  return {
    html,
    plain_text: plainText,
    editor_version: 1,
    updated_by: updatedBy ?? null,
    updated_at: updatedAt,
  };
}

export function buildLegacyGamePlanMirror(html: string, updatedAt: string) {
  return {
    html,
    version: 2,
    updated_at: updatedAt,
  };
}
