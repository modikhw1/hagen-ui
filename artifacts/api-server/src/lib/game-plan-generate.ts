import { logger } from './logger.js';

export type GamePlanMode = 'studio' | 'demo';
export type GamePlanSource = 'ai' | 'fallback';

export type GamePlanReferenceInput = {
  url: string;
  label?: string;
  note?: string;
  platform?: string;
};

export type GamePlanImageInput = {
  url: string;
  caption?: string;
};

export type GamePlanGenerateInput = {
  customer_name: string;
  niche: string;
  platform: string;
  character: string;
  people: string;
  aesthetic: string;
  goals: string;
  effort_level: string;
  unique: string;
  audience: string;
  references: GamePlanReferenceInput[];
  images: GamePlanImageInput[];
  focus: string;
  tone: string;
  constraints: string;
  notes: string[];
  strategy_view: string;
  opportunities: string;
  letrend_fit: string;
  tiktok_handle: string;
  proposed_concepts_per_week: string;
  preview_metrics?: Record<string, unknown>;
};

export type GamePlanDraftResult = {
  html: string;
  plainText: string;
  source: GamePlanSource;
  model?: string;
  reason?: string;
};

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeReferenceArray(value: unknown): GamePlanReferenceInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string')
    .slice(0, 8)
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        url: str(row.url),
        label: str(row.label) || undefined,
        note: str(row.note) || undefined,
        platform: str(row.platform) || undefined,
      };
    })
    .filter((item) => item.url);
}

function safeImageArray(value: unknown): GamePlanImageInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string')
    .slice(0, 4)
    .map((item) => {
      const row = item as Record<string, unknown>;
      return { url: str(row.url), caption: str(row.caption) || undefined };
    })
    .filter((item) => item.url);
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(str).filter(Boolean).slice(0, 12);
}

function safeRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function buildGamePlanInput(body: Record<string, unknown>): GamePlanGenerateInput {
  return {
    customer_name: str(body.customer_name),
    niche: str(body.niche),
    platform: str(body.platform),
    character: str(body.character),
    people: str(body.people),
    aesthetic: str(body.aesthetic),
    goals: str(body.goals),
    effort_level: str(body.effort_level),
    unique: str(body.unique),
    audience: str(body.audience),
    references: safeReferenceArray(body.references),
    images: safeImageArray(body.images),
    focus: str(body.focus),
    tone: str(body.tone),
    constraints: str(body.constraints),
    notes: safeStringArray(body.notes),
    strategy_view: str(body.strategy_view),
    opportunities: str(body.opportunities),
    letrend_fit: str(body.letrend_fit),
    tiktok_handle: str(body.tiktok_handle).replace(/^@/, ''),
    proposed_concepts_per_week: str(body.proposed_concepts_per_week),
    preview_metrics: safeRecord(body.preview_metrics),
  };
}

function escHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeHref(value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (/^(https?:\/\/|mailto:)/i.test(text)) return text;
  return `https://${text}`;
}

type LinkPlatform = 'tiktok' | 'instagram' | 'youtube' | 'article' | 'external';

function detectLink(url: string): LinkPlatform {
  const normalized = normalizeHref(url);
  if (!normalized) return 'external';
  if (/tiktok\.com/i.test(normalized)) return 'tiktok';
  if (/instagram\.com/i.test(normalized)) return 'instagram';
  if (/youtube\.com|youtu\.be/i.test(normalized)) return 'youtube';
  try {
    const { protocol } = new URL(normalized);
    if (protocol === 'http:' || protocol === 'https:') return 'article';
  } catch {
    return 'external';
  }
  return 'external';
}

function toLinkPlatform(value: string): LinkPlatform {
  const valid: LinkPlatform[] = ['tiktok', 'instagram', 'youtube', 'article', 'external'];
  return valid.includes(value as LinkPlatform) ? (value as LinkPlatform) : 'external';
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function parseAttrs(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of value.matchAll(/([a-zA-Z0-9_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    const key = match[1]?.toLowerCase();
    const attrValue = match[3] ?? match[4] ?? '';
    if (key) out[key] = attrValue;
  }
  return out;
}

export function stripGamePlanHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderLinkChip(rawHref: string, rawLabel?: string, rawPlatform?: string): string {
  const href = normalizeHref(rawHref);
  if (!href) return '';
  const platform = rawPlatform ? toLinkPlatform(rawPlatform) : detectLink(href);
  const label = (rawLabel || '').trim() || getHostname(href) || href;
  const icons: Record<LinkPlatform, string> = {
    tiktok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/></svg>',
    instagram: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>',
    youtube: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 00.5 6.19 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.81 3.02 3.02 0 002.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 002.12-2.14A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.81zM9.55 15.5V8.5l6.27 3.5-6.27 3.5z"/></svg>',
    article: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
    external: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  };
  return `<span data-type="linkChip" style="display:inline;"><a class="gp-link-chip gp-link-chip--${platform}" href="${escHtml(href)}" target="_blank" rel="noopener noreferrer" data-gp-chip="1" data-platform="${platform}" data-label="${escHtml(label)}">${icons[platform]}<span class="gp-link-chip__label">${escHtml(label)}</span></a></span>`;
}

function renderImageFigure(rawSrc: string, rawCaption?: string): string {
  const src = normalizeHref(rawSrc);
  if (!src) return '';
  const caption = (rawCaption || '').trim();
  return `<figure class="gp-image" data-width="100" style="width:100%"><img src="${escHtml(src)}" alt="${escHtml(caption || 'Game Plan image')}" loading="lazy" /><figcaption>${escHtml(caption)}</figcaption></figure>`;
}

function renderImageGallery(items: Array<{ src: string; caption?: string }>): string {
  const images = items
    .map((item) => ({ src: normalizeHref(item.src), caption: (item.caption || '').trim() }))
    .filter((item) => item.src);
  if (images.length === 0) return '';
  const cols = Math.max(1, Math.min(images.length, 3));
  return `<div class="gp-image-grid" style="display:grid;grid-template-columns:repeat(${cols}, 1fr);gap:8px;margin-bottom:12px">${images.map((item) => `<div data-gp-image-item="1"><img src="${escHtml(item.src)}" alt="${escHtml(item.caption || 'Game Plan image')}" loading="lazy" style="width:100%;aspect-ratio:4 / 3;object-fit:cover;border-radius:6px;display:block"/><div class="gp-image-grid__caption">${escHtml(item.caption)}</div></div>`).join('')}</div>`;
}

function sanitizeHtml(raw: string): string {
  let out = raw.trim().replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  out = out.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select)\b[^>]*\/?>/gi, '');
  out = out.replace(/<[^>]+>/g, (tag) => {
    if (/^<!/i.test(tag) || /^<\//.test(tag)) return tag;
    const match = tag.match(/^<([a-z0-9-]+)([\s\S]*?)\/?>$/i);
    if (!match) return '';
    const tagName = match[1].toLowerCase();
    let attrs = match[2] || '';
    attrs = attrs.replace(/\s+on[a-z-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
    attrs = attrs.replace(/\s+(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi, (_full, name: string, _q, dq, sq, bare) => {
      const value = dq ?? sq ?? bare ?? '';
      const safeValue = /^(javascript|data):/i.test(value.trim()) ? '' : normalizeHref(value);
      return safeValue ? ` ${name}="${escHtml(safeValue)}"` : '';
    });
    if (tagName === 'a') {
      attrs = attrs.replace(/\s+(target|rel)\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
      if (/\shref=/i.test(attrs)) attrs += ' target="_blank" rel="noopener noreferrer"';
    }
    if (tagName === 'img') {
      if (!/\ssrc=/i.test(attrs)) return '';
      if (!/\sloading=/i.test(attrs)) attrs += ' loading="lazy"';
    }
    return `<${tagName}${attrs}>`;
  });
  return out.trim();
}

function convertAndNormalize(rawText: string): string {
  const fenceMatch = rawText.match(/```(?:html)?\s*([\s\S]*?)```/i);
  let out = (fenceMatch ? fenceMatch[1].trim() : rawText.trim())
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?(html|body)\b[^>]*>/gi, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '');

  out = out.replace(/<image-gallery\b[^>]*>([\s\S]*?)<\/image-gallery>/gi, (_full, inner) => {
    const items: Array<{ src: string; caption?: string }> = [];
    for (const match of String(inner).matchAll(/<image-item\b([^>]*)\/?>/gi)) {
      const attrs = parseAttrs(match[1] || '');
      if (attrs.src) items.push({ src: attrs.src, caption: attrs.caption });
    }
    return renderImageGallery(items);
  });
  out = out.replace(/<image-figure\b([^>]*)>([\s\S]*?)<\/image-figure>/gi, (_full, attrs, inner) => {
    const parsed = parseAttrs(attrs || '');
    return renderImageFigure(parsed.src || '', parsed.caption || stripGamePlanHtml(inner));
  });
  out = out.replace(/<image-figure\b([^>]*)\/>/gi, (_full, attrs) => {
    const parsed = parseAttrs(attrs || '');
    return renderImageFigure(parsed.src || '', parsed.caption);
  });
  out = out.replace(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi, (_full, inner) => {
    const imgMatch = String(inner).match(/<img\b([^>]*)\/?>/i);
    if (!imgMatch) return inner;
    const attrs = parseAttrs(imgMatch[1] || '');
    if (!attrs.src) return inner;
    const captionMatch = String(inner).match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
    const caption = captionMatch ? stripGamePlanHtml(captionMatch[1]) : attrs.alt || attrs.caption || '';
    return renderImageFigure(attrs.src, caption);
  });
  out = out.replace(/<link-chip\b([^>]*)>([\s\S]*?)<\/link-chip>/gi, (_full, attrs, inner) => {
    const parsed = parseAttrs(attrs || '');
    return renderLinkChip(parsed.url || parsed.href || '', parsed.label || stripGamePlanHtml(inner), parsed.platform);
  });
  out = out.replace(/<link-chip\b([^>]*)\/>/gi, (_full, attrs) => {
    const parsed = parseAttrs(attrs || '');
    return renderLinkChip(parsed.url || parsed.href || '', parsed.label, parsed.platform);
  });
  out = out.replace(/<h[1-6]\b[^>]*>/gi, '<h3>').replace(/<\/h[1-6]>/gi, '</h3>');
  out = out.replace(/<img\b([^>]*)\/?>/gi, (_full, attrs) => {
    const parsed = parseAttrs(attrs || '');
    return renderImageFigure(parsed.src || '', parsed.alt || parsed.caption || '');
  });
  out = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_full, attrs, inner) => {
    const parsed = parseAttrs(attrs || '');
    const href = normalizeHref(parsed.href || parsed.url || '');
    const label = stripGamePlanHtml(inner).trim() || parsed.label || getHostname(href) || href;
    if (!href) return escHtml(label);
    const platform = detectLink(href);
    if (platform === 'external' && label && label !== href) {
      return `<a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">${escHtml(label)}</a>`;
    }
    return renderLinkChip(href, label, platform);
  });
  out = out.replace(/<p>\s*(<figure\b[\s\S]*?<\/figure>)\s*<\/p>/gi, '$1').replace(/<p>\s*<\/p>/gi, '');
  return sanitizeHtml(out).trim();
}

function buildFallbackHtml(input: GamePlanGenerateInput, mode: GamePlanMode): string {
  const paragraph = (value: string, fallback: string): string => `<p>${escHtml(value.trim() || fallback)}</p>`;
  const refs = input.references
    .map((reference) => ({ ...reference, url: normalizeHref(reference.url) }))
    .filter((reference) => reference.url);
  const images = input.images
    .map((image) => ({ ...image, url: normalizeHref(image.url) }))
    .filter((image) => image.url);

  const refBlock = refs.length > 0
    ? ['<h3>Referenser</h3>', ...refs.map((reference, index) => `<div style="margin-bottom:12px"><div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px">${renderLinkChip(reference.url, reference.label || `Referens ${index + 1}`, reference.platform)}</div>${reference.note ? paragraph(reference.note, '') : ''}</div>`)].join('')
    : '';
  const imageBlock = images.length === 1
    ? `<h3>Visuell riktning</h3>${renderImageFigure(images[0].url, images[0].caption || 'Referensbild')}`
    : images.length > 1
      ? `<h3>Visuell riktning</h3>${renderImageGallery(images.map((image, index) => ({ src: image.url, caption: image.caption || `Referens ${index + 1}` })))}`
      : '';

  const profileParts = [
    input.customer_name ? `${input.customer_name} är kunden vi bygger planen för.` : 'Kunden är fokus för planen.',
    input.niche ? `Nisch/bransch: ${input.niche}.` : '',
    input.tiktok_handle ? `TikTok: @${input.tiktok_handle}.` : '',
    input.proposed_concepts_per_week ? `Föreslagen takt: ${input.proposed_concepts_per_week} koncept per vecka.` : '',
  ].filter(Boolean).join(' ');

  const demoBlocks = mode === 'demo'
    ? [
        input.strategy_view ? `<h3>Nuläge</h3>${paragraph(input.strategy_view, '')}` : '',
        input.opportunities ? `<h3>Möjligheter</h3>${paragraph(input.opportunities, '')}` : '',
        input.letrend_fit ? `<h3>Varför LeTrend</h3>${paragraph(input.letrend_fit, '')}` : '',
      ].filter(Boolean).join('')
    : '';

  const contextBlocks = [
    input.focus ? `<h3>Fokus</h3>${paragraph(input.focus, '')}` : '',
    input.character ? `<h3>Verksamhetens karaktär</h3>${paragraph(input.character, '')}` : '',
    input.people ? `<h3>Personalen</h3>${paragraph(input.people, '')}` : '',
    input.aesthetic ? `<h3>Lokal och estetik</h3>${paragraph(input.aesthetic, '')}` : '',
    input.goals ? `<h3>Mål</h3>${paragraph(input.goals, '')}` : '',
    input.unique ? `<h3>Det unika</h3>${paragraph(input.unique, '')}` : '',
    input.audience ? `<h3>Målgrupp</h3>${paragraph(input.audience, '')}` : '',
    input.effort_level ? `<h3>Ambitionsnivå</h3>${paragraph(input.effort_level, '')}` : '',
    input.constraints ? `<h3>Ramar</h3>${paragraph(input.constraints, '')}` : '',
    input.notes.length > 0 ? `<h3>Arbetsnoter</h3><ul>${input.notes.map((note) => `<li>${escHtml(note)}</li>`).join('')}</ul>` : '',
  ].filter(Boolean).join('');

  return sanitizeHtml([
    '<h3>Kundprofil</h3>',
    paragraph(profileParts, 'Beskriv kunden, deras nisch och plattform.'),
    demoBlocks,
    contextBlocks,
    refBlock,
    imageBlock,
    '<h3>Nästa steg</h3>',
    mode === 'demo'
      ? '<p>Gå igenom förslaget, justera formuleringarna och fyll feed planner med de koncept som bäst visar riktningen innan länken skickas.</p>'
      : '<p>Gå igenom planen, markera vad som känns mest relevant just nu och svara med eventuella justeringar eller fler referenser som vi ska ta vidare.</p>',
  ].join(''));
}

function normalizedReferences(input: GamePlanGenerateInput) {
  return input.references
    .map((reference) => ({
      url: normalizeHref(reference.url),
      label: reference.label || undefined,
      note: reference.note || undefined,
      platform: reference.platform || undefined,
    }))
    .filter((reference) => reference.url);
}

function normalizedImages(input: GamePlanGenerateInput) {
  return input.images
    .map((image) => ({ url: normalizeHref(image.url), caption: image.caption || undefined }))
    .filter((image) => image.url);
}

function buildStudioPrompt(input: GamePlanGenerateInput): string {
  const customerContext = {
    kund: input.customer_name || '(okänd)',
    nisch_och_bransch: input.niche || null,
    primar_plattform: input.platform || null,
    fokus: input.focus || null,
    onskad_ton: input.tone || null,
    verksamhetens_karaktar: input.character || null,
    personalen: input.people || null,
    lokal_och_estetik: input.aesthetic || null,
    vad_kunden_vill_uppna: input.goals || null,
    ambitionsniva: input.effort_level || null,
    nagot_som_sticker_ut: input.unique || null,
    malgrupp: input.audience || null,
    ramar: input.constraints || null,
    arbetsnoter: input.notes.length > 0 ? input.notes : null,
    referenser: normalizedReferences(input).length > 0 ? normalizedReferences(input) : null,
    bilder: normalizedImages(input).length > 0 ? normalizedImages(input) : null,
  };

  const part1 = [
    'Du skriver ett Game Plan-utkast för LeTrend, en content management-byrå som jobbar med restauranger, caféer och barer.',
    '',
    'PERSPEKTIV',
    'Skriv direkt till verksamhetsägaren med "du", "er" och "ni". Texten ska kännas som att en content manager pratar med kunden, inte som konsultspråk.',
    'LeTrend är experten. Kunden har redan tackat ja. Skriv som att planen är fastlagd och detta är genomgången av den.',
    '',
    'LETREND-FILOSOFI',
    'LeTrend kurerar beprövade koncept: sketchbaserat och humoristiskt innehåll som fungerar på TikTok, anpassat till vad just den här verksamheten har att erbjuda.',
    'LeTrend spelar inte in. Kunden spelar in med sin mobil utifrån koncepten och LeTrend guidar, klipper och håller planen levande.',
    '',
    'TON',
    'Avsändaren är en 20-25-årig content manager på LeTrend: kunnig, direkt och jordnära. Inte säljbrev.',
    'Hellre "vardagen" än "den dagliga driften". Hellre "spela in" än "producera innehåll".',
    '',
    'FORMAT',
    'Returnera ett HTML-fragment med exakt fyra stycken. Varje stycke inleds med en <strong>-taggad fras på 3-6 ord.',
    'Inga H-rubriker. Inga punktlistor. Ingen avslutande uppmaning till dialog. Använd <p>-taggar.',
    'Varje stycke ska vara 75-100 ord. Total längd: 300-400 ord.',
    'Om referenslänkar finns: placera relevanta <link-chip url="..." platform="tiktok|instagram|youtube|article|external" label="..."/> i slutet av det stycke de informerar.',
    '',
    'STYCKEN I ORDNING',
    '1. Verksamhetens förutsättningar: vad kunden faktiskt har som LeTrend kan bygga koncept runt.',
    '2. Konceptrekommendation: vilken typ av sketch som passar, varför det matchar och hur det spelas in.',
    '3. Insats: vem som är på kamera, hur ofta kunden spelar in och hur LeTrend guidar.',
    '4. Vad som byggs: awareness, kvalitetssignaler och realistisk tidshorisont.',
  ].join('\n');

  return `${part1}\n\nKundkontext (JSON):\n${JSON.stringify(customerContext, null, 2).slice(0, 5000)}`;
}

function buildDemoPrompt(input: GamePlanGenerateInput): string {
  const customerContext = {
    prospekt: input.customer_name || '(okänd)',
    tiktok_handle: input.tiktok_handle ? `@${input.tiktok_handle}` : null,
    nisch_och_bransch: input.niche || null,
    primar_plattform: input.platform || 'TikTok',
    foreslagen_takt: input.proposed_concepts_per_week || null,
    nuvarande_strategi: input.strategy_view || null,
    mojligheter: input.opportunities || null,
    varfor_letrend: input.letrend_fit || null,
    verksamhetens_karaktar: input.character || null,
    mal: input.goals || null,
    unikt: input.unique || null,
    malgrupp: input.audience || null,
    statistik: input.preview_metrics || null,
    referenser: normalizedReferences(input).length > 0 ? normalizedReferences(input) : null,
  };

  const part1 = [
    'Du skriver ett Game Plan-utkast till en publik LeTrend-demo för ett prospekt.',
    'Kunden har inte tackat ja än. Texten ska därför vara en kvalificerad preview, inte onboarding och inte ett hårt säljbrev.',
    '',
    'PERSPEKTIV',
    'Skriv direkt till verksamhetsägaren med "ni" och "er". Använd konkreta observationer och var tydlig med varför LeTrend är relevant.',
    'Formulera det som ett genomtänkt förslag: "vi skulle börja med", "det här går att testa", "det här passar eftersom".',
    'Undvik överlöften, fluff, generiska marknadsföringsord och formuleringar som låter som en pitchdeck.',
    '',
    'LETREND-FILOSOFI',
    'LeTrend kurerar beprövade TikTok-koncept, anpassar dem till verksamhetens vardag och gör det lättare för kunden att spela in med mobil.',
    'Humor, igenkänning, personalens energi och återkommande format är viktigare än perfekt produktion.',
    '',
    'FORMAT',
    'Returnera BARA ett HTML-fragment. Ingen markdown och inga kodblock.',
    'Skriv exakt fyra <p>-stycken. Varje stycke ska börja med en <strong>-taggad fras på 3-6 ord.',
    'Varje stycke ska vara 55-85 ord. Total längd: 240-340 ord.',
    'Inga H-rubriker, inga punktlistor och ingen avslutande CTA.',
    '',
    'STYCKEN I ORDNING',
    '1. Nuläge: vad verksamheten verkar göra idag och vilken outnyttjad potential som finns.',
    '2. Möjlighet: vilken typ av TikTok-format eller sketchriktning som bör testas först.',
    '3. Varför LeTrend: varför en kuraterad feed planner och CM-styrning hjälper just den här verksamheten.',
    '4. Första veckorna: realistisk takt, hur kunden spelar in och vad previewn visar.',
  ].join('\n');

  return `${part1}\n\nProspektkontext (JSON):\n${JSON.stringify(customerContext, null, 2).slice(0, 5000)}`;
}

export async function generateGamePlanDraft({
  input,
  mode,
}: {
  input: GamePlanGenerateInput;
  mode: GamePlanMode;
}): Promise<GamePlanDraftResult> {
  const apiKey = process.env['REPLIT_AI_INTEGRATIONS_API_KEY'] ?? process.env['GEMINI_API_KEY'];
  const baseUrl = process.env['REPLIT_AI_INTEGRATIONS_GEMINI_BASE_URL'] ?? 'https://generativelanguage.googleapis.com/v1beta';
  const prompt = mode === 'demo' ? buildDemoPrompt(input) : buildStudioPrompt(input);

  if (!apiKey) {
    logger.warn({ mode }, 'game-plan/generate: no Gemini API key, using server fallback');
    const html = buildFallbackHtml(input, mode);
    return { html, plainText: stripGamePlanHtml(html), source: 'fallback', reason: 'no_api_key' };
  }

  let html = '';
  let source: GamePlanSource = 'ai';
  let reason = '';

  try {
    const upstream = await fetch(`${baseUrl}/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: mode === 'demo' ? 0.58 : 0.65,
          maxOutputTokens: mode === 'demo' ? 1200 : 1024,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      throw new Error(`Gemini ${upstream.status}: ${text.slice(0, 200)}`);
    }

    const data = await upstream.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const rawText = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    html = convertAndNormalize(rawText);
    if (!html) throw new Error('empty_response');
  } catch (err) {
    logger.warn({ err, mode }, 'game-plan/generate: Gemini call failed, using server fallback');
    source = 'fallback';
    reason = err instanceof Error ? err.message : String(err);
    html = buildFallbackHtml(input, mode);
  }

  return {
    html,
    plainText: stripGamePlanHtml(html),
    source,
    model: source === 'ai' ? 'gemini-2.5-flash' : undefined,
    reason: reason || undefined,
  };
}
