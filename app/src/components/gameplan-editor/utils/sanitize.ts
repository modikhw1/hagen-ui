import { normalizeHref } from './link-helpers';

export function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

export function sanitizeRichTextHtml(input: string): string {
  if (!input) return '';
  if (typeof window === 'undefined') return input;

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
      if ((name === 'href' || name === 'src') && /^javascript:/i.test(value)) {
        el.removeAttribute(attr.name);
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
