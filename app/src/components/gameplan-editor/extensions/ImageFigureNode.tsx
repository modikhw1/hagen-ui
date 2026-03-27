'use client';

import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useState } from 'react';
import { normalizeHref } from '../utils/link-helpers';

function clampWidth(value: unknown): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) return 100;
  return Math.min(100, Math.max(10, Math.round(numberValue)));
}

function ImageFigureView({ node, updateAttributes }: NodeViewProps) {
  const src = normalizeHref(String(node.attrs.src || ''));
  const caption = String(node.attrs.caption || '');
  const width = clampWidth(node.attrs.width);
  const [isEditingCaption, setIsEditingCaption] = useState(false);

  if (!src) return null;

  return (
    <NodeViewWrapper as="div" className="gp-image-node" draggable data-drag-handle>
      <figure className="gp-image" style={{ width: `${width}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={caption || 'Game Plan image'}
          style={{ width: '100%', borderRadius: 8 }}
          contentEditable={false}
          loading="lazy"
        />
        {isEditingCaption ? (
          <input
            autoFocus
            defaultValue={caption}
            placeholder="Lagg till bildtext..."
            onBlur={(event) => {
              updateAttributes({ caption: event.target.value });
              setIsEditingCaption(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                updateAttributes({ caption: (event.target as HTMLInputElement).value });
                setIsEditingCaption(false);
              }
              if (event.key === 'Escape') {
                setIsEditingCaption(false);
              }
            }}
            style={{
              width: '100%',
              marginTop: 6,
              border: 'none',
              borderBottom: '1px solid rgba(74,47,24,0.15)',
              fontSize: 12,
              color: '#7D6E5D',
              fontStyle: 'italic',
              outline: 'none',
              background: 'transparent',
            }}
          />
        ) : (
          <figcaption
            onClick={() => setIsEditingCaption(true)}
            style={{
              marginTop: 6,
              fontSize: 12,
              color: '#7D6E5D',
              fontStyle: 'italic',
              cursor: 'text',
              minHeight: 18,
            }}
          >
            {caption || 'Klicka for att lagga till bildtext...'}
          </figcaption>
        )}
      </figure>
    </NodeViewWrapper>
  );
}

function getFigureWidth(el: HTMLElement): number {
  const widthAttr = el.getAttribute('data-width');
  if (widthAttr) {
    return clampWidth(Number.parseInt(widthAttr, 10));
  }

  const widthMatch = (el.getAttribute('style') || '').match(/width\s*:\s*(\d+)\s*%/i);
  if (widthMatch) {
    return clampWidth(Number.parseInt(widthMatch[1], 10));
  }

  return 100;
}

export const ImageFigureNode = Node.create({
  name: 'imageFigure',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      caption: { default: '' },
      width: { default: 100 },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure.gp-image',
        getAttrs: (el) => {
          const element = el as HTMLElement;
          const src = normalizeHref(element.querySelector('img')?.getAttribute('src') || '');
          if (!src) return false;

          const caption = (element.querySelector('figcaption')?.textContent || '').trim();
          return {
            src,
            caption,
            width: getFigureWidth(element),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>;
    const src = normalizeHref(String(attrs.src || ''));
    const caption = String(attrs.caption || '').trim();
    const width = clampWidth(attrs.width);

    if (!src) {
      return ['figure', { class: 'gp-image', style: `width:${width}%` }, ['figcaption', {}, caption]];
    }

    return [
      'figure',
      { class: 'gp-image', style: `width:${width}%`, 'data-width': String(width) },
      ['img', { src, alt: caption || 'Game Plan image', loading: 'lazy' }],
      ['figcaption', {}, caption],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageFigureView);
  },
});
