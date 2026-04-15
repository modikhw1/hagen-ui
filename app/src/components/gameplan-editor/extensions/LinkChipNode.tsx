'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import {
  detectLinkType,
  getHostname,
  getLinkPlatformLabel,
  normalizeHref,
  toLinkPlatform,
  type LinkPlatform,
} from '../utils/link-helpers';

const PLATFORMS: ReadonlyArray<LinkPlatform> = ['tiktok', 'instagram', 'youtube', 'article', 'external'];

function parsePlatformFromClassName(className: string): LinkPlatform | null {
  for (const platform of PLATFORMS) {
    if (className.includes(`gp-link-chip--${platform}`)) return platform;
  }
  return null;
}

function resolveLabel(href: string, value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw) return raw;
  return getHostname(href) || href;
}

function renderIcon(platform: LinkPlatform) {
  if (platform === 'tiktok') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
      </svg>
    );
  }
  if (platform === 'instagram') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    );
  }
  if (platform === 'youtube') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 00.5 6.19 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.81 3.02 3.02 0 002.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 002.12-2.14A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.81zM9.55 15.5V8.5l6.27 3.5-6.27 3.5z" />
      </svg>
    );
  }
  if (platform === 'article') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15,3 21,3 21,9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function renderIconSpec(platform: LinkPlatform): unknown[] {
  if (platform === 'tiktok') {
    return ['svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'currentColor' }, ['path', { d: 'M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z' }]];
  }
  if (platform === 'instagram') {
    return ['svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, ['rect', { x: 2, y: 2, width: 20, height: 20, rx: 5, ry: 5 }], ['path', { d: 'M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z' }], ['line', { x1: 17.5, y1: 6.5, x2: 17.51, y2: 6.5 }]];
  }
  if (platform === 'youtube') {
    return ['svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'currentColor' }, ['path', { d: 'M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 00.5 6.19 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.81 3.02 3.02 0 002.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 002.12-2.14A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.81zM9.55 15.5V8.5l6.27 3.5-6.27 3.5z' }]];
  }
  if (platform === 'article') {
    return ['svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, ['path', { d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z' }], ['polyline', { points: '14,2 14,8 20,8' }], ['line', { x1: 16, y1: 13, x2: 8, y2: 13 }], ['line', { x1: 16, y1: 17, x2: 8, y2: 17 }], ['line', { x1: 10, y1: 9, x2: 8, y2: 9 }]];
  }
  return ['svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, ['path', { d: 'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6' }], ['polyline', { points: '15,3 21,3 21,9' }], ['line', { x1: 10, y1: 14, x2: 21, y2: 3 }]];
}

function readLinkChipAttrs(el: HTMLElement): { href: string; label: string; platform: LinkPlatform } {
  const rawHref = el.getAttribute('href') || '';
  const href = normalizeHref(rawHref);
  const className = el.className || '';
  const classPlatform = parsePlatformFromClassName(className);
  const rawPlatform = el.getAttribute('platform') || el.getAttribute('data-platform');
  const attrPlatform = rawPlatform ? toLinkPlatform(rawPlatform) : null;
  const platform = classPlatform || attrPlatform || detectLinkType(href);

  const labelFromAttr = (el.getAttribute('label') || el.getAttribute('data-label') || '').trim();
  const labelNode = (el.querySelector('.gp-link-chip__label')?.textContent || '').trim();
  const textLabel = (el.textContent || '').trim();
  const label = resolveLabel(href, labelFromAttr || labelNode || textLabel);

  return { href, label, platform };
}

function LinkChipView({ node }: NodeViewProps) {
  const href = normalizeHref(String(node.attrs.href || ''));
  const platform = toLinkPlatform(String(node.attrs.platform || 'external'));
  const label = resolveLabel(href, node.attrs.label);

  return (
    <NodeViewWrapper
      as="span"
      className="gp-link-chip-wrapper"
      contentEditable={false}
      suppressContentEditableWarning
      style={{ display: 'inline' }}
    >
      <a
        href={href || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className={`gp-link-chip gp-link-chip--${platform}`}
        contentEditable={false}
        suppressContentEditableWarning
        data-gp-chip="1"
        data-label={label}
        data-platform={platform}
      >
        <span className="gp-link-chip__icon" aria-hidden="true">
          {renderIcon(platform)}
        </span>
        <span className="gp-link-chip__label">{label}</span>
      </a>
    </NodeViewWrapper>
  );
}

export const LinkChipNode = Node.create({
  name: 'linkChip',
  priority: 1000,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      href: { default: '' },
      label: { default: '' },
      platform: { default: 'external' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="linkChip"]',
        getAttrs: (el) => {
          const anchor = (el as HTMLElement).querySelector('a[data-gp-chip]') || (el as HTMLElement).querySelector('a.gp-link-chip');
          if (!anchor) return false;
          return readLinkChipAttrs(anchor as HTMLElement);
        },
      },
      {
        tag: 'a[data-gp-chip]',
        getAttrs: (el) => readLinkChipAttrs(el as HTMLElement),
      },
      {
        tag: 'a.gp-link-chip',
        getAttrs: (el) => readLinkChipAttrs(el as HTMLElement),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>;
    const href = normalizeHref(String(attrs.href || ''));
    const platform = toLinkPlatform(String(attrs.platform || 'external'));
    const label = resolveLabel(href, attrs.label);
    const baseAttrs: Record<string, string> = {
      class: `gp-link-chip gp-link-chip--${platform}`,
      target: '_blank',
      rel: 'noopener noreferrer',
      'data-gp-chip': '1',
      'data-platform': platform,
      'data-label': label,
      'aria-label': getLinkPlatformLabel(platform),
    };
    if (href) {
      baseAttrs.href = href;
    }

    return [
      'span',
      { 'data-type': 'linkChip', style: 'display:inline;' },
      [
        'a',
        mergeAttributes(baseAttrs, HTMLAttributes),
        ['span', { class: 'gp-link-chip__icon', 'aria-hidden': 'true' }, renderIconSpec(platform)],
        ['span', { class: 'gp-link-chip__label' }, label],
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LinkChipView);
  },
});
