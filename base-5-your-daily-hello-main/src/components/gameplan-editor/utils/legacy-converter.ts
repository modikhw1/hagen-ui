import {
  detectLinkType,
  getHostname,
  getLinkPlatformLabel,
  normalizeHref,
  toLinkPlatform,
  type LinkPlatform,
} from './link-helpers';
import { sanitizeRichTextHtml, stripHtml } from './sanitize';

export type GamePlanLinkType = LinkPlatform;
export type GamePlanNoteType = 'text' | 'heading' | 'link' | 'bullet' | 'richtext' | 'image' | 'images';

export interface GamePlanImageItem {
  url: string;
  caption?: string;
}

export interface GamePlanNote {
  type: GamePlanNoteType;
  content?: string;
  label?: string;
  url?: string;
  linkType?: GamePlanLinkType;
  caption?: string;
  width?: number;
  float?: 'none' | 'left' | 'right';
  images?: GamePlanImageItem[];
}

export interface RawGamePlanNote {
  type?: string;
  content?: string;
  label?: string;
  url?: string;
  linkType?: string;
  caption?: string;
  width?: number;
  float?: string;
  links?: Array<{ label?: string; url?: string; linkType?: string }>;
  images?: Array<{ url?: string; caption?: string }>;
}

const LINK_META: Record<GamePlanLinkType, { label: string; color: string }> = {
  tiktok: { label: 'TikTok', color: '#1a1612' },
  instagram: { label: 'Instagram', color: '#833ab4' },
  youtube: { label: 'YouTube', color: '#cc0000' },
  article: { label: 'Artikel', color: '#4a4239' },
  external: { label: 'Lank', color: '#6b4423' },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function clampWidth(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 100;
  return Math.min(100, Math.max(10, Math.round(value)));
}

function getLinkIconHtml(platform: GamePlanLinkType): string {
  if (platform === 'tiktok') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/></svg>';
  }
  if (platform === 'instagram') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>';
  }
  if (platform === 'youtube') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 00.5 6.19 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.81 3.02 3.02 0 002.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 002.12-2.14A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.81zM9.55 15.5V8.5l6.27 3.5-6.27 3.5z"/></svg>';
  }
  if (platform === 'article') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>';
  }
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
}

function renderImageFigure(note: GamePlanNote): string {
  const src = normalizeHref(note.url || '');
  if (!src) return '';
  const width = clampWidth(note.width);
  const caption = (note.caption || '').trim();
  const captionHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';
  return `<figure class="gp-image" style="width:${width}%"><img src="${escapeAttr(src)}" alt="${escapeAttr(caption || 'Game Plan image')}" />${captionHtml}</figure>`;
}

function buildLinkChipHtml(url: string, label: string, linkType?: GamePlanLinkType): string {
  const href = normalizeHref(url);
  if (!href) return '';

  const type = toLinkPlatform(linkType || detectLinkType(href));
  const meta = LINK_META[type];
  const host = getHostname(href);
  const title = label.trim() || host || href;

  return (
    `<a class="gp-link-chip gp-link-chip--${type}" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" data-gp-chip="1" platform="${type}" label="${escapeAttr(title)}" aria-label="${escapeAttr(meta.label)}">` +
      `<span class="gp-link-chip__icon" aria-hidden="true">${getLinkIconHtml(type)}</span>` +
      `<span class="gp-link-chip__label">${escapeHtml(title)}</span>` +
    `</a>`
  );
}

export function normalizeGamePlanNotes(input: RawGamePlanNote[] | undefined | null): GamePlanNote[] {
  if (!Array.isArray(input)) return [];
  const normalized: GamePlanNote[] = [];

  input.forEach((note) => {
    if (!note || typeof note !== 'object') return;

    if (note.type === 'links' && Array.isArray(note.links)) {
      note.links.forEach((link) => {
        normalized.push({
          type: 'link',
          label: (link.label || '').trim(),
          url: normalizeHref(link.url || ''),
          linkType: toLinkPlatform(link.linkType),
        });
      });
      return;
    }

    if (note.type === 'link') {
      normalized.push({
        type: 'link',
        label: (note.label || '').trim(),
        url: normalizeHref(note.url || ''),
        linkType: toLinkPlatform(note.linkType),
      });
      return;
    }

    if (note.type === 'image') {
      normalized.push({
        type: 'image',
        url: normalizeHref(note.url || ''),
        caption: (note.caption || '').trim(),
        width: clampWidth(note.width),
        float: note.float === 'left' || note.float === 'right' || note.float === 'none' ? note.float : 'none',
      });
      return;
    }

    if (note.type === 'images') {
      normalized.push({
        type: 'images',
        images: (note.images || [])
          .map((image) => ({ url: normalizeHref(image.url || ''), caption: (image.caption || '').trim() }))
          .filter((image) => image.url.length > 0),
      });
      return;
    }

    if (note.type === 'heading' || note.type === 'bullet' || note.type === 'text' || note.type === 'richtext') {
      normalized.push({ type: note.type, content: note.content || '' });
      return;
    }

    normalized.push({ type: 'text', content: note.content || '' });
  });

  return normalized;
}

export function gamePlanNotesToHtml(notes: RawGamePlanNote[] | GamePlanNote[]): string {
  const normalized = normalizeGamePlanNotes(notes as RawGamePlanNote[]);
  const chunks: string[] = [];
  let linkBuffer: GamePlanNote[] = [];

  const flushLinks = () => {
    if (!linkBuffer.length) return;

    const links = linkBuffer
      .map((link) => buildLinkChipHtml(link.url || '', (link.label || '').trim(), toLinkPlatform(link.linkType)))
      .filter(Boolean)
      .join('');

    if (links) chunks.push(`<p class="gp-link-row">${links}</p>`);
    linkBuffer = [];
  };

  normalized.forEach((note) => {
    if (note.type === 'link') {
      linkBuffer.push(note);
      return;
    }

    flushLinks();

    if (note.type === 'richtext') {
      const sanitized = sanitizeRichTextHtml(note.content || '');
      if (sanitized && stripHtml(sanitized).length > 0) chunks.push(sanitized);
      return;
    }

    if (note.type === 'heading') {
      if ((note.content || '').trim()) chunks.push(`<h3>${escapeHtml(note.content || '')}</h3>`);
      return;
    }

    if (note.type === 'bullet') {
      if ((note.content || '').trim()) chunks.push(`<ul><li>${escapeHtml(note.content || '')}</li></ul>`);
      return;
    }

    if (note.type === 'text') {
      const text = (note.content || '').trim();
      if (!text) return;
      chunks.push(`<p>${escapeHtml(text).replace(/\n/g, '<br />')}</p>`);
      return;
    }

    if (note.type === 'image') {
      const imageFigure = renderImageFigure(note);
      if (imageFigure) chunks.push(imageFigure);
      return;
    }

    if (note.type === 'images') {
      (note.images || []).forEach((image) => {
        const figure = renderImageFigure({
          type: 'image',
          url: image.url,
          caption: image.caption,
          width: 100,
        });
        if (figure) chunks.push(figure);
      });
    }
  });

  flushLinks();
  return sanitizeRichTextHtml(chunks.join(''));
}

export function getGamePlanLinkMeta() {
  return LINK_META;
}

export function getGamePlanLinkDisplay(platform: GamePlanLinkType): { label: string; color: string } {
  return {
    label: getLinkPlatformLabel(platform),
    color: LINK_META[platform].color,
  };
}
