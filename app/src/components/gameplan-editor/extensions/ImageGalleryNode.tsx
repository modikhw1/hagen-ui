'use client';

import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { normalizeHref } from '../utils/link-helpers';

interface GalleryImage {
  src: string;
  caption: string;
}

function normalizeImages(input: unknown): GalleryImage[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const src = normalizeHref(String(record.src || record.url || ''));
      if (!src) return null;
      const caption = String(record.caption || '').trim();
      return { src, caption };
    })
    .filter((item): item is GalleryImage => Boolean(item));
}

function getGalleryColumns(images: GalleryImage[]): number {
  return Math.max(1, Math.min(images.length || 1, 3));
}

function ImageGalleryView({ node }: NodeViewProps) {
  const images = normalizeImages(node.attrs.images);
  if (!images.length) return null;

  return (
    <NodeViewWrapper as="div" className="gp-image-gallery-node" draggable data-drag-handle>
      <div
        className="gp-image-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${getGalleryColumns(images)}, 1fr)`,
          gap: 8,
          marginBottom: 12,
        }}
      >
        {images.map((image, index) => (
          <div key={`${image.src}-${index}`} data-gp-image-item="1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.src}
              alt={image.caption || 'Game Plan image'}
              style={{
                width: '100%',
                aspectRatio: '4 / 3',
                objectFit: 'cover',
                borderRadius: 6,
                display: 'block',
              }}
              loading="lazy"
              contentEditable={false}
            />
            {image.caption ? (
              <div
                className="gp-image-grid__caption"
                style={{
                  fontSize: 11,
                  color: '#9D8E7D',
                  marginTop: 4,
                  textAlign: 'center',
                }}
              >
                {image.caption}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </NodeViewWrapper>
  );
}

export const ImageGalleryNode = Node.create({
  name: 'imageGallery',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      images: { default: [] },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.gp-image-grid',
        getAttrs: (el) => {
          const element = el as HTMLElement;
          const wrappers = Array.from(element.querySelectorAll('[data-gp-image-item], :scope > div'));
          const images = wrappers
            .map((wrapper) => {
              const img = wrapper.querySelector('img');
              if (!img) return null;
              const src = normalizeHref(img.getAttribute('src') || '');
              if (!src) return null;
              const caption =
                (wrapper.querySelector('.gp-image-grid__caption')?.textContent || img.getAttribute('alt') || '').trim();
              return { src, caption };
            })
            .filter((item): item is GalleryImage => Boolean(item));

          if (!images.length) return false;
          return { images };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>;
    const images = normalizeImages(attrs.images);
    const columns = getGalleryColumns(images);

    return [
      'div',
      {
        class: 'gp-image-grid',
        style: `display:grid;grid-template-columns:repeat(${columns}, 1fr);gap:8px;margin-bottom:12px`,
      },
      ...images.map((image) => [
        'div',
        { 'data-gp-image-item': '1' },
        [
          'img',
          {
            src: image.src,
            alt: image.caption || 'Game Plan image',
            loading: 'lazy',
            style: 'width:100%;aspect-ratio:4 / 3;object-fit:cover;border-radius:6px;display:block',
          },
        ],
        image.caption
          ? ['div', { class: 'gp-image-grid__caption', style: 'font-size:11px;color:#9D8E7D;margin-top:4px;text-align:center' }, image.caption]
          : ['div', { class: 'gp-image-grid__caption' }, ''],
      ]),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageGalleryView);
  },
});
