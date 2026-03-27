'use client';

import { useEffect, useRef, useCallback } from 'react';
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
import { sanitizeRichTextHtml } from './utils/sanitize';

interface GamePlanEditorProps {
  initialHtml: string;
  onChange: (html: string) => void;
  isFullscreen?: boolean;
}

export function GamePlanEditor({ initialHtml, onChange, isFullscreen = false }: GamePlanEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestHtmlRef = useRef(initialHtml);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
        // bulletList, orderedList, listItem included automatically
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
        onChange(html);
      }, 300);
    },
    editorProps: {
      attributes: {
        class: 'gameplan-editor-content',
        style: `
          font-family: 'Lora', Georgia, serif;
          font-size: 14px;
          color: #4A4239;
          line-height: 1.6;
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

  // Flush on blur so save-button clicks get the latest content
  useEffect(() => {
    if (!editor) return;
    const handleBlur = () => flushPendingChanges(editor);
    editor.on('blur', handleBlur);
    return () => { editor.off('blur', handleBlur); };
  }, [editor, flushPendingChanges]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        // Final save — editor may already be destroyed here, so use latestHtmlRef
        onChangeRef.current(latestHtmlRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!editor) return null;

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 12,
        border: '1px solid rgba(74,47,24,0.08)',
        overflow: 'hidden',
      }}
    >
      <GamePlanToolbar editor={editor} />

      <BubbleMenu editor={editor} options={{}}>
        <div
          style={{
            display: 'flex',
            gap: 2,
            padding: 4,
            background: '#1A1612',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: 4,
              background: editor.isActive('bold') ? 'rgba(250,248,245,0.2)' : 'transparent',
              color: '#FAF8F5',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            B
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: 4,
              background: editor.isActive('italic') ? 'rgba(250,248,245,0.2)' : 'transparent',
              color: '#FAF8F5',
              cursor: 'pointer',
              fontSize: 13,
              fontStyle: 'italic',
            }}
          >
            I
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: 4,
              background: editor.isActive('underline') ? 'rgba(250,248,245,0.2)' : 'transparent',
              color: '#FAF8F5',
              cursor: 'pointer',
              fontSize: 13,
              textDecoration: 'underline',
            }}
          >
            U
          </button>
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} />
    </div>
  );
}
