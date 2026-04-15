'use client';

import { useState, type CSSProperties } from 'react';
import type { Editor } from '@tiptap/react';
import { detectLinkType, normalizeHref, toLinkPlatform, type LinkPlatform } from './utils/link-helpers';

type LinkPlatformSelection = LinkPlatform | 'auto';

interface GamePlanToolbarProps {
  editor: Editor;
}

const separatorStyle: CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  background: 'rgba(74,47,24,0.1)',
  margin: '0 4px',
  flexShrink: 0,
};

function getButtonStyle(active: boolean, disabled = false): CSSProperties {
  return {
    padding: '6px 10px',
    border: 'none',
    borderRadius: 8,
    background: active ? '#6B4423' : 'transparent',
    color: active ? '#FFFFFF' : '#5D4D3D',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    fontWeight: 600,
    transition: '0.2s ease',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    opacity: disabled ? 0.5 : 1,
  };
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label
      style={{
        display: 'block',
        marginBottom: 6,
        color: '#5D4D3D',
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {children}
    </label>
  );
}

export function GamePlanToolbar({ editor }: GamePlanToolbarProps) {
  const [showLinkChipDialog, setShowLinkChipDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkPlatform, setLinkPlatform] = useState<LinkPlatformSelection>('auto');
  const canUndo = editor.can().chain().focus().undo().run();
  const canRedo = editor.can().chain().focus().redo().run();

  const insertLinkChip = () => {
    const href = normalizeHref(linkUrl);
    if (!href) return;

    const platform = linkPlatform === 'auto' ? detectLinkType(href) : toLinkPlatform(linkPlatform);

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'linkChip',
        attrs: { href, label: linkLabel.trim(), platform },
      })
      .run();

    setLinkUrl('');
    setLinkLabel('');
    setLinkPlatform('auto');
    setShowLinkChipDialog(false);
  };

  const insertLink = () => {
    const currentHref = String(editor.getAttributes('link').href || '');
    const url = prompt('Länk-URL:', currentHref);
    if (url === null) return;
    const href = normalizeHref(url);

    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
      })
      .run();
  };

  const insertImage = () => {
    const url = prompt('Bild-URL:');
    if (!url) return;
    const src = normalizeHref(url);
    if (!src) return;
    const caption = prompt('Bildtext (valfri):') || '';

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'imageFigure',
        attrs: { src, caption, width: 100 },
      })
      .run();
  };

  const insertImageGallery = () => {
    const input = prompt('Klistra in 2-3 bild-URL:er, separerade med kommatecken eller radbrytningar:');
    if (!input) return;

    const images = input
      .split(/[\n,]+/)
      .map((value) => normalizeHref(value))
      .filter(Boolean)
      .slice(0, 3)
      .map((src) => ({ src, caption: '' }));

    if (images.length < 2) return;

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'imageGallery',
        attrs: { images },
      })
      .run();
  };

  const insertYoutube = () => {
    const url = prompt('YouTube-URL:');
    if (!url) return;
    editor.commands.setYoutubeVideo({ src: url });
  };

  return (
    <>
      <div
        className="gameplan-editor-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'nowrap',
          gap: 2,
          padding: '8px 12px',
          background: '#FAF8F5',
          borderBottom: '1px solid rgba(74,47,24,0.08)',
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          style={getButtonStyle(editor.isActive('heading', { level: 3 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </button>

        <div style={separatorStyle} />

        <button type="button" style={getButtonStyle(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()}>
          B
        </button>
        <button type="button" style={getButtonStyle(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()}>
          I
        </button>
        <button type="button" style={getButtonStyle(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          U
        </button>
        <button type="button" style={getButtonStyle(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          Punktlista
        </button>
        <button type="button" style={getButtonStyle(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          Numrerad
        </button>

        <div style={separatorStyle} />

        <button type="button" style={getButtonStyle(editor.isActive('link'))} onClick={insertLink}>
          Länk
        </button>
        <button type="button" style={getButtonStyle(false)} onClick={() => setShowLinkChipDialog(true)}>
          Link-chip
        </button>
        <button type="button" style={getButtonStyle(false)} onClick={insertImage}>
          Bild
        </button>
        <button type="button" style={getButtonStyle(false)} onClick={insertImageGallery}>
          Galleri
        </button>
        <button type="button" style={getButtonStyle(false)} onClick={insertYoutube}>
          YouTube
        </button>

        <div style={separatorStyle} />

        <button
          type="button"
          style={getButtonStyle(false, !canUndo)}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!canUndo}
          title="Ångra"
        >
          Undo
        </button>
        <button
          type="button"
          style={getButtonStyle(false, !canRedo)}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!canRedo}
          title="Gör om"
        >
          Redo
        </button>
      </div>

      {showLinkChipDialog ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(26,22,18,0.24)',
            padding: 16,
          }}
          onClick={() => setShowLinkChipDialog(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: 24,
              width: 'min(420px, 100%)',
              boxShadow: '0 8px 32px rgba(107,68,35,0.25)',
              border: '1px solid rgba(74,47,24,0.08)',
            }}
          >
            <div style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#1A1612' }}>
              Infoga länk-chip
            </div>
            <div style={{ marginBottom: 12 }}>
              <FieldLabel>URL</FieldLabel>
              <input
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://tiktok.com/@..."
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(74,47,24,0.15)',
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <FieldLabel>Titel</FieldLabel>
              <input
                value={linkLabel}
                onChange={(event) => setLinkLabel(event.target.value)}
                placeholder="Ert bästa exempel"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(74,47,24,0.15)',
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Plattform</FieldLabel>
              <select
                value={linkPlatform}
                onChange={(event) => setLinkPlatform(event.target.value as LinkPlatformSelection)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(74,47,24,0.15)',
                  fontSize: 14,
                }}
              >
                <option value="auto">Auto-detect</option>
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
                <option value="youtube">YouTube</option>
                <option value="article">Artikel</option>
                <option value="external">Extern</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowLinkChipDialog(false)}
                style={{
                  padding: '10px 16px',
                  border: '1px solid rgba(74,47,24,0.08)',
                  borderRadius: 8,
                  background: '#fff',
                  color: '#1A1612',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={insertLinkChip}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: 8,
                  background: '#6B4423',
                  color: '#FAF8F5',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Infoga
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
