'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Youtube from '@tiptap/extension-youtube';
import Gapcursor from '@tiptap/extension-gapcursor';
import Dropcursor from '@tiptap/extension-dropcursor';
import { LinkChipNode } from './extensions/LinkChipNode';
import { ImageFigureNode } from './extensions/ImageFigureNode';
import { ImageGalleryNode } from './extensions/ImageGalleryNode';
import { GamePlanToolbar } from './GamePlanToolbar';
import { normalizeHref } from './utils/link-helpers';
import { sanitizeRichTextHtml } from './utils/sanitize';

interface GamePlanEditorProps {
  initialHtml: string;
  onChange: (html: string) => void;
  isFullscreen?: boolean;
}

function BubbleButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 8px',
        border: 'none',
        borderRadius: 6,
        background: active ? 'rgba(250,248,245,0.18)' : 'transparent',
        color: '#FAF8F5',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

export function GamePlanEditor({ initialHtml, onChange, isFullscreen = false }: GamePlanEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestHtmlRef = useRef(initialHtml);
  const onChangeRef = useRef(onChange);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const flushPendingChanges = useCallback((editorInstance: ReturnType<typeof useEditor>) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (editorInstance) {
      const html = sanitizeRichTextHtml(editorInstance.getHTML());
      if (html !== latestHtmlRef.current) {
        latestHtmlRef.current = html;
        onChangeRef.current(html);
      }
    }
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Gapcursor,
      Dropcursor.configure({
        color: '#6B4423',
        width: 2,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Placeholder.configure({
        placeholder: 'Skriv din Game Plan här...',
      }),
      Youtube.configure({
        inline: false,
        HTMLAttributes: {
          style: 'width: 100%; aspect-ratio: 16 / 9; border-radius: 12px;',
        },
      }),
      LinkChipNode,
      ImageFigureNode,
      ImageGalleryNode,
    ],
    content: initialHtml,
    onUpdate: ({ editor: instance }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const html = sanitizeRichTextHtml(instance.getHTML());
        latestHtmlRef.current = html;
        onChangeRef.current(html);
      }, 300);
    },
    editorProps: {
      attributes: {
        class: 'gameplan-editor-content gp-rich-text',
        style: `
          min-height: ${isFullscreen ? 'calc(100vh - 120px)' : '400px'};
          padding: 18px 20px;
          outline: none;
        `,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const nextContent = initialHtml || '';
    const currentContent = editor.getHTML();
    if (nextContent !== currentContent) {
      editor.commands.setContent(nextContent, { emitUpdate: false });
    }
  }, [editor, initialHtml]);

  useEffect(() => {
    if (!editor) return;
    const handleBlur = () => flushPendingChanges(editor);
    editor.on('blur', handleBlur);
    return () => {
      editor.off('blur', handleBlur);
    };
  }, [editor, flushPendingChanges]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        onChangeRef.current(latestHtmlRef.current);
      }
    };
  }, []);

  if (!editor) return null;

  const activeLinkHref = String(editor.getAttributes('link').href || '');

  const openLinkDialog = () => {
    setLinkValue(activeLinkHref);
    setLinkDialogOpen(true);
  };

  const applyLink = () => {
    const href = normalizeHref(linkValue);
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkDialogOpen(false);
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

    setLinkDialogOpen(false);
  };

  return (
    <div className="gameplan-editor-shell">
      <GamePlanToolbar editor={editor} />

      <BubbleMenu editor={editor} options={{ placement: 'top' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: 6,
            background: '#1A1612',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            maxWidth: 'min(360px, calc(100vw - 32px))',
          }}
        >
          <BubbleButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            B
          </BubbleButton>
          <BubbleButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            I
          </BubbleButton>
          <BubbleButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            U
          </BubbleButton>
          <BubbleButton active={editor.isActive('link')} onClick={openLinkDialog}>
            Länk
          </BubbleButton>
          {editor.isActive('link') && activeLinkHref ? (
            <span
              style={{
                color: 'rgba(250,248,245,0.74)',
                fontSize: 11,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 160,
              }}
              title={activeLinkHref}
            >
              {activeLinkHref}
            </span>
          ) : null}
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} />

      {linkDialogOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(26, 22, 18, 0.24)',
            padding: 16,
          }}
          onClick={() => setLinkDialogOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(420px, 100%)',
              background: '#FFFFFF',
              borderRadius: 14,
              padding: 20,
              boxShadow: '0 8px 32px rgba(107, 68, 35, 0.25)',
              border: '1px solid rgba(74, 47, 24, 0.08)',
            }}
          >
            <div
              style={{
                fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                fontSize: 16,
                fontWeight: 600,
                color: '#1A1612',
                marginBottom: 12,
              }}
              >
              Lägg till länk
            </div>
            <input
              autoFocus
              value={linkValue}
              onChange={(event) => setLinkValue(event.target.value)}
              placeholder="https://..."
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 12,
                border: '1px solid rgba(74,47,24,0.15)',
                fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                fontSize: 14,
                color: '#4A4239',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setLinkDialogOpen(false)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(74,47,24,0.08)',
                  background: '#FFFFFF',
                  color: '#1A1612',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={applyLink}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#6B4423',
                  color: '#FAF8F5',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Spara länk
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
