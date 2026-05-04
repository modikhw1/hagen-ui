'use client';

import { useState, type CSSProperties } from 'react';
import type { Editor } from '@tiptap/react';
import { detectLinkType, normalizeHref, toLinkPlatform, type LinkPlatform } from './utils/link-helpers';

type LinkPlatformSelection = LinkPlatform | 'auto';

interface GamePlanToolbarProps {
  editor: Editor;
}

function getButtonStyle(active: boolean, disabled = false): CSSProperties {
  return {
    padding: '8px 10px',
    border: active ? '1px solid #6B4423' : '1px solid transparent',
    borderRadius: 8,
    background: active ? '#FAF8F5' : 'transparent',
    color: active ? '#6B4423' : '#5D4D3D',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    fontWeight: 600,
    transition: '0.2s ease',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    opacity: disabled ? 0.5 : 1,
  };
}

function menuButtonStyle(): CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 12px',
    border: 'none',
    background: 'transparent',
    color: '#4A4239',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    textAlign: 'left',
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
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkPlatform, setLinkPlatform] = useState<LinkPlatformSelection>('auto');

  const [showInsertLinkDialog, setShowInsertLinkDialog] = useState(false);
  const [insertLinkUrl, setInsertLinkUrl] = useState('');

  const [showInsertImageDialog, setShowInsertImageDialog] = useState(false);
  const [insertImageUrl, setInsertImageUrl] = useState('');
  const [insertImageCaption, setInsertImageCaption] = useState('');

  const [showInsertGalleryDialog, setShowInsertGalleryDialog] = useState(false);
  const [insertGalleryInput, setInsertGalleryInput] = useState('');

  const canUndo = editor.can().chain().focus().undo().run();
  const canRedo = editor.can().chain().focus().redo().run();

  const closeMenus = () => {
    setShowMoreMenu(false);
  };

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
    closeMenus();
  };

  const openInsertLinkDialog = () => {
    const currentHref = String(editor.getAttributes('link').href || '');
    setInsertLinkUrl(currentHref);
    setShowInsertLinkDialog(true);
    closeMenus();
  };

  const applyInsertLink = () => {
    const href = normalizeHref(insertLinkUrl);
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href, target: '_blank', rel: 'noopener noreferrer' })
        .run();
    }
    setShowInsertLinkDialog(false);
    setInsertLinkUrl('');
  };

  const openInsertImageDialog = () => {
    setInsertImageUrl('');
    setInsertImageCaption('');
    setShowInsertImageDialog(true);
    closeMenus();
  };

  const applyInsertImage = () => {
    const src = normalizeHref(insertImageUrl);
    if (!src) return;
    editor
      .chain()
      .focus()
      .insertContent({ type: 'imageFigure', attrs: { src, caption: insertImageCaption.trim(), width: 100 } })
      .run();
    setShowInsertImageDialog(false);
    setInsertImageUrl('');
    setInsertImageCaption('');
  };

  const openInsertGalleryDialog = () => {
    setInsertGalleryInput('');
    setShowInsertGalleryDialog(true);
    closeMenus();
  };

  const applyInsertGallery = () => {
    const images = insertGalleryInput
      .split(/[\n,]+/)
      .map((v) => normalizeHref(v.trim()))
      .filter(Boolean)
      .slice(0, 3)
      .map((src) => ({ src, caption: '' }));
    if (images.length < 2) return;
    editor
      .chain()
      .focus()
      .insertContent({ type: 'imageGallery', attrs: { images } })
      .run();
    setShowInsertGalleryDialog(false);
    setInsertGalleryInput('');
  };

  const insertYoutube = () => {
    const url = prompt('YouTube-URL:');
    if (!url) return;
    editor.commands.setYoutubeVideo({ src: url });
    closeMenus();
  };

  const runMenuAction = (action: () => void) => {
    action();
    closeMenus();
  };

  return (
    <>
      <div
        className="gameplan-editor-toolbar"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 12px',
          background: '#FAF8F5',
          borderBottom: '1px solid rgba(74,47,24,0.08)',
          overflowX: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            style={getButtonStyle(editor.isActive('bold'))}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            B
          </button>
          <button
            type="button"
            style={getButtonStyle(editor.isActive('italic'))}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            I
          </button>
          <button
            type="button"
            style={getButtonStyle(editor.isActive('link'))}
            onClick={openInsertLinkDialog}
          >
            Länk
          </button>
          <button
            type="button"
            style={getButtonStyle(false)}
            onClick={openInsertImageDialog}
          >
            Bild
          </button>
        </div>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setShowMoreMenu((prev) => !prev)}
            style={getButtonStyle(showMoreMenu)}
          >
            Mer
          </button>

          {showMoreMenu ? (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: 220,
                padding: 6,
                borderRadius: 12,
                background: '#FFFFFF',
                border: '1px solid rgba(74,47,24,0.08)',
                boxShadow: '0 12px 24px rgba(74,47,24,0.12)',
                zIndex: 10,
              }}
            >
              <button type="button" style={menuButtonStyle()} onClick={() => runMenuAction(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}>
                <span>Rubrik</span>
                <span style={{ color: '#9D8E7D' }}>H3</span>
              </button>
              <button type="button" style={menuButtonStyle()} onClick={() => runMenuAction(() => editor.chain().focus().toggleBulletList().run())}>
                Punktlista
              </button>
              <button type="button" style={menuButtonStyle()} onClick={() => runMenuAction(() => editor.chain().focus().toggleOrderedList().run())}>
                Numrerad lista
              </button>
              <button type="button" style={menuButtonStyle()} onClick={() => setShowLinkChipDialog(true)}>
                Länkchip
              </button>
              <button type="button" style={menuButtonStyle()} onClick={openInsertGalleryDialog}>
                Bildgalleri
              </button>
              <button type="button" style={menuButtonStyle()} onClick={insertYoutube}>
                YouTube
              </button>
              <div style={{ height: 1, background: 'rgba(74,47,24,0.08)', margin: '4px 6px' }} />
              <button
                type="button"
                style={menuButtonStyle()}
                onClick={() => runMenuAction(() => editor.chain().focus().undo().run())}
                disabled={!canUndo}
              >
                Ångra
              </button>
              <button
                type="button"
                style={menuButtonStyle()}
                onClick={() => runMenuAction(() => editor.chain().focus().redo().run())}
                disabled={!canRedo}
              >
                Gör om
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {showInsertLinkDialog ? (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,22,18,0.24)', padding: 16 }}
          onClick={() => setShowInsertLinkDialog(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: 'min(420px, 100%)', boxShadow: '0 8px 32px rgba(107,68,35,0.25)', border: '1px solid rgba(74,47,24,0.08)' }}>
            <div style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#1A1612' }}>Lägg till länk</div>
            <FieldLabel>URL</FieldLabel>
            <input
              autoFocus
              value={insertLinkUrl}
              onChange={(e) => setInsertLinkUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyInsertLink(); if (e.key === 'Escape') setShowInsertLinkDialog(false); }}
              placeholder="https://..."
              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(74,47,24,0.15)', fontSize: 14, marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowInsertLinkDialog(false)} style={{ padding: '10px 16px', border: '1px solid rgba(74,47,24,0.08)', borderRadius: 8, background: '#fff', color: '#1A1612', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Avbryt</button>
              <button type="button" onClick={applyInsertLink} style={{ padding: '10px 16px', border: 'none', borderRadius: 8, background: '#6B4423', color: '#FAF8F5', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Spara länk</button>
            </div>
          </div>
        </div>
      ) : null}

      {showInsertImageDialog ? (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,22,18,0.24)', padding: 16 }}
          onClick={() => setShowInsertImageDialog(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: 'min(420px, 100%)', boxShadow: '0 8px 32px rgba(107,68,35,0.25)', border: '1px solid rgba(74,47,24,0.08)' }}>
            <div style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#1A1612' }}>Infoga bild</div>
            <div style={{ marginBottom: 12 }}>
              <FieldLabel>Bild-URL</FieldLabel>
              <input
                autoFocus
                value={insertImageUrl}
                onChange={(e) => setInsertImageUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setShowInsertImageDialog(false); }}
                placeholder="https://..."
                style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(74,47,24,0.15)', fontSize: 14 }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Bildtext (valfri)</FieldLabel>
              <input
                value={insertImageCaption}
                onChange={(e) => setInsertImageCaption(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setShowInsertImageDialog(false); }}
                placeholder="Beskriv bilden..."
                style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(74,47,24,0.15)', fontSize: 14 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowInsertImageDialog(false)} style={{ padding: '10px 16px', border: '1px solid rgba(74,47,24,0.08)', borderRadius: 8, background: '#fff', color: '#1A1612', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Avbryt</button>
              <button type="button" onClick={applyInsertImage} disabled={!insertImageUrl.trim()} style={{ padding: '10px 16px', border: 'none', borderRadius: 8, background: insertImageUrl.trim() ? '#6B4423' : '#9D8E7D', color: '#FAF8F5', cursor: insertImageUrl.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>Infoga</button>
            </div>
          </div>
        </div>
      ) : null}

      {showInsertGalleryDialog ? (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,22,18,0.24)', padding: 16 }}
          onClick={() => setShowInsertGalleryDialog(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: 'min(420px, 100%)', boxShadow: '0 8px 32px rgba(107,68,35,0.25)', border: '1px solid rgba(74,47,24,0.08)' }}>
            <div style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#1A1612' }}>Infoga bildgalleri</div>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#5D4D3D' }}>Klistra in 2–3 bild-URL:er, en per rad.</div>
            <FieldLabel>Bild-URL:er</FieldLabel>
            <textarea
              autoFocus
              value={insertGalleryInput}
              onChange={(e) => setInsertGalleryInput(e.target.value)}
              placeholder={'https://...\nhttps://...\nhttps://...'}
              rows={4}
              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(74,47,24,0.15)', fontSize: 14, resize: 'vertical', marginBottom: 16, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowInsertGalleryDialog(false)} style={{ padding: '10px 16px', border: '1px solid rgba(74,47,24,0.08)', borderRadius: 8, background: '#fff', color: '#1A1612', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Avbryt</button>
              <button type="button" onClick={applyInsertGallery} style={{ padding: '10px 16px', border: 'none', borderRadius: 8, background: '#6B4423', color: '#FAF8F5', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Infoga</button>
            </div>
          </div>
        </div>
      ) : null}

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
