import { normalizeHref } from './link-helpers';

export function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeUrlAttribute(name: 'href' | 'src', value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^(javascript|data):/i.test(trimmed)) return '';
  if (name === 'src' && /^mailto:/i.test(trimmed)) return '';
  return normalizeHref(trimmed);
}

export function sanitizeRichTextHtmlServer(input: string): string {
  if (!input) return '';

  let output = input.trim();

  output = output.replace(/<!--[\s\S]*?-->/g, '');
  output = output.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  output = output.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select)\b[^>]*\/?>/gi, '');
  output = output.replace(/<[^>]+>/g, (tag) => {
    if (/^<!/i.test(tag) || /^<\//.test(tag)) return tag;

    const match = tag.match(/^<([a-z0-9-]+)([\s\S]*?)\/?>$/i);
    if (!match) return '';

    const [, tagNameRaw, rawAttributes] = match;
    const tagName = tagNameRaw.toLowerCase();
    let attributes = rawAttributes || '';

    attributes = attributes.replace(/\s+on[a-z-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
    attributes = attributes.replace(
      /\s+(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi,
      (_full, name: 'href' | 'src', _quoted, doubleQuoted, singleQuoted, bare) => {
        const rawValue = doubleQuoted ?? singleQuoted ?? bare ?? '';
        const sanitizedValue = sanitizeUrlAttribute(name, rawValue);
        return sanitizedValue ? ` ${name}="${sanitizedValue}"` : '';
      }
    );

    if (tagName === 'a') {
      attributes = attributes.replace(/\s+(target|rel)\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
      if (/\shref=/i.test(attributes)) {
        attributes += ' target="_blank" rel="noopener noreferrer"';
      }
    }

    if (tagName === 'img') {
      if (!/\ssrc=/i.test(attributes)) return '';
      if (!/\sloading=/i.test(attributes)) {
        attributes += ' loading="lazy"';
      }
    }

    return `<${tagName}${attributes}>`;
  });

  return output.trim();
}

export function sanitizeRichTextHtml(input: string): string {
  if (!input) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return sanitizeRichTextHtmlServer(input);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'text/html');

  doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,textarea,select').forEach((node) => node.remove());

  doc.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
      if (name === 'href' || name === 'src') {
        const sanitizedValue = sanitizeUrlAttribute(name, value);
        if (!sanitizedValue) {
          el.removeAttribute(attr.name);
        } else {
          el.setAttribute(attr.name, sanitizedValue);
        }
      }
    });

    if (el.tagName === 'A') {
      const href = normalizeHref(el.getAttribute('href') || '');
      if (!href) {
        el.remove();
      } else {
        el.setAttribute('href', href);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }

    if (el.tagName === 'IMG') {
      const src = normalizeHref(el.getAttribute('src') || '');
      if (!src) {
        el.remove();
      } else {
        el.setAttribute('src', src);
        el.setAttribute('loading', 'lazy');
      }
    }
  });

  return doc.body.innerHTML.trim();
}
