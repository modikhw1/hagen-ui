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
  background: 'rgba(74,47,24,0.1)',
  margin: '0 4px',
  flexShrink: 0,
};

function getButtonStyle(active: boolean, disabled = false): CSSProperties {
  return {
    padding: '6px 10px',
    border: 'none',
    borderRadius: 6,
    background: active ? '#6B4423' : 'transparent',
    color: active ? '#FFFFFF' : '#5D4D3D',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    fontWeight: 500,
    transition: 'all 0.12s',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    opacity: disabled ? 0.5 : 1,
  };
}

export function GamePlanToolbar({ editor }: GamePlanToolbarProps) {
  const [showLinkDialog, setShowLinkDialog] = useState(false);
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
    setShowLinkDialog(false);
  };

  const insertImage = () => {
    const url = prompt('Bild-URL:');
    if (!url) return;
    const src = normalizeHref(url);
    if (!src) return;

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'imageFigure',
        attrs: { src, caption: '', width: 100 },
      })
      .run();
  };

  const insertYoutube = () => {
    const url = prompt('YouTube-URL:');
    if (!url) return;
    editor.commands.setYoutubeVideo({ src: url });
  };

  return (
    <div
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
      <button style={getButtonStyle(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()}>
        <strong>B</strong>
      </button>
      <button style={getButtonStyle(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em>I</em>
      </button>
      <button style={getButtonStyle(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <u>U</u>
      </button>

      <div style={separatorStyle} />

      <button
        style={getButtonStyle(editor.isActive('heading', { level: 3 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </button>
      <button style={getButtonStyle(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        Lista
      </button>
      <button style={getButtonStyle(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1. Lista
      </button>

      <div style={separatorStyle} />

      <button style={getButtonStyle(false)} onClick={() => setShowLinkDialog(true)}>
        Lank-chip
      </button>
      <button style={getButtonStyle(false)} onClick={insertImage}>
        Bild
      </button>
      <button style={getButtonStyle(false)} onClick={insertYoutube}>
        YouTube
      </button>

      <div style={separatorStyle} />

      <button style={getButtonStyle(false, !canUndo)} onClick={() => editor.chain().focus().undo().run()} disabled={!canUndo} title="Ångra">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
      <button style={getButtonStyle(false, !canRedo)} onClick={() => editor.chain().focus().redo().run()} disabled={!canRedo} title="Gör om">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
        </svg>
      </button>

      {showLinkDialog ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.3)',
          }}
          onClick={() => setShowLinkDialog(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              width: 400,
              maxWidth: '90vw',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#1A1612' }}>Infoga lank-chip</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: '#5D4D3D', display: 'block', marginBottom: 4 }}>URL</label>
              <input
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://tiktok.com/@..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(74,47,24,0.15)',
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: '#5D4D3D', display: 'block', marginBottom: 4 }}>Titel (valfritt)</label>
              <input
                value={linkLabel}
                onChange={(event) => setLinkLabel(event.target.value)}
                placeholder="Titel"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(74,47,24,0.15)',
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: '#5D4D3D', display: 'block', marginBottom: 4 }}>Plattform</label>
              <select
                value={linkPlatform}
                onChange={(event) => setLinkPlatform(event.target.value as LinkPlatformSelection)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
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
                onClick={() => setShowLinkDialog(false)}
                style={{
                  padding: '10px 16px',
                  border: '1px solid rgba(74,47,24,0.15)',
                  borderRadius: 8,
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                Avbryt
              </button>
              <button
                onClick={insertLinkChip}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: 8,
                  background: '#6B4423',
                  color: '#FAF8F5',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Infoga
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
