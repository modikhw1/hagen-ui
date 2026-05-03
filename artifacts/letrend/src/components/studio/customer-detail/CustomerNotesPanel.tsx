import React from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CustomerNote } from '@/types/studio-v2';

interface CustomerNotesPanelProps {
  notes: CustomerNote[];
  newNoteContent: string;
  setNewNoteContent: (value: string) => void;
  addingNote: boolean;
  handleAddNote: () => Promise<void>;
  handleDeleteNote: (noteId: string) => Promise<void>;
  parseMarkdownLinks: (text: string) => React.ReactNode[] | string;
  formatDateTime: (dateStr: string) => string;
}

export function CustomerNotesPanel({
  notes,
  newNoteContent,
  setNewNoteContent,
  addingNote,
  handleAddNote,
  handleDeleteNote,
  parseMarkdownLinks,
  formatDateTime,
}: CustomerNotesPanelProps) {
  return (
    <div>
      <h3
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: LeTrendColors.brownDark,
          margin: '0 0 16px',
        }}
      >
        Noteringar
      </h3>

      <div
        style={{
          background: LeTrendColors.surface,
          borderRadius: LeTrendRadius.lg,
          padding: 20,
          marginBottom: 20,
          border: `1px solid ${LeTrendColors.border}`,
        }}
      >
        <textarea
          value={newNoteContent}
          onChange={(event) => setNewNoteContent(event.target.value)}
          placeholder="Lägg till intern notering, länk eller uppföljning..."
          rows={3}
          style={{
            width: '100%',
            padding: 12,
            borderRadius: LeTrendRadius.md,
            border: `1px solid ${LeTrendColors.border}`,
            fontSize: 14,
            resize: 'vertical',
            lineHeight: 1.6,
            boxSizing: 'border-box',
            marginBottom: 12,
          }}
        />
        <button
          onClick={() => void handleAddNote()}
          disabled={addingNote || !newNoteContent.trim()}
          style={{
            padding: '10px 16px',
            background: newNoteContent.trim() ? LeTrendColors.brownLight : LeTrendColors.textMuted,
            color: '#fff',
            border: 'none',
            borderRadius: LeTrendRadius.md,
            fontSize: 13,
            fontWeight: 600,
            cursor: newNoteContent.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          {addingNote ? 'Sparar...' : 'Lägg till notering'}
        </button>
      </div>

      {notes.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 32,
            color: LeTrendColors.textMuted,
            fontSize: 14,
          }}
        >
          Inga noteringar än
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notes.map((note) => (
            <div
              key={note.id}
              style={{
                background: '#fff',
                borderRadius: LeTrendRadius.md,
                padding: 16,
                border: `1px solid ${LeTrendColors.border}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: LeTrendColors.textPrimary,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {parseMarkdownLinks(note.content)}
                  </div>
                  <div style={{ fontSize: 11, color: LeTrendColors.textMuted, marginTop: 10 }}>
                    {formatDateTime(note.created_at)}
                  </div>
                </div>
                <button
                  onClick={() => void handleDeleteNote(note.id)}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    padding: '6px 10px',
                    borderRadius: LeTrendRadius.md,
                    cursor: 'pointer',
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  Ta bort
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
