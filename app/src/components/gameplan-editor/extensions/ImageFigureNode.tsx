'use client';

import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useRef } from 'react';
import { normalizeHref } from '../utils/link-helpers';

function clampWidth(value: unknown): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) return 100;
  return Math.min(100, Math.max(10, Math.round(numberValue)));
}

function ImageFigureView({ node, updateAttributes, selected }: NodeViewProps) {
  const src = normalizeHref(String(node.attrs.src || ''));
  const caption = String(node.attrs.caption || '');
  const width = clampWidth(node.attrs.width);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const containerRef = useRef<HTMLElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(100);

  const handleResizeStart = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    const parentWidth = containerRef.current?.parentElement?.getBoundingClientRect().width || 600;

    const handleMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startXRef.current;
      const deltaPercent = (deltaX / parentWidth) * 100;
      const newWidth = side === 'right'
        ? startWidthRef.current + deltaPercent
        : startWidthRef.current - deltaPercent;
      updateAttributes({ width: clampWidth(newWidth) });
    };

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [width, updateAttributes]);

  if (!src) return null;

  return (
    <NodeViewWrapper as="div" className="gp-image-node" draggable data-drag-handle>
      <figure
        ref={containerRef as React.RefObject<HTMLElement>}
        className={`gp-image${selected ? ' gp-image--selected' : ''}`}
        style={{ width: `${width}%`, position: 'relative', margin: '0 auto' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={caption || 'Game Plan image'}
          style={{ width: '100%', borderRadius: 8, display: 'block' }}
          contentEditable={false}
          loading="lazy"
        />
        {selected && (
          <>
            <div
              className="gp-resize-handle gp-resize-handle--left"
              onMouseDown={(e) => handleResizeStart(e, 'left')}
            />
            <div
              className="gp-resize-handle gp-resize-handle--right"
              onMouseDown={(e) => handleResizeStart(e, 'right')}
            />
          </>
        )}
        {isEditingCaption ? (
          <input
            autoFocus
            defaultValue={caption}
            placeholder="Lägg till bildtext..."
            className="gp-image-caption-input"
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
          />
        ) : (
          <figcaption
            onClick={() => setIsEditingCaption(true)}
            className="gp-image-caption"
          >
            {caption || 'Klicka för att lägga till bildtext...'}
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
