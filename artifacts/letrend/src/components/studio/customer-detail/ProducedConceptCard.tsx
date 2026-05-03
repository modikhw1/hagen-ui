'use client';

import React from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CustomerConcept, CustomerNote } from '@/types/studio-v2';
import type { TranslatedConcept } from '@/lib/translator';
import type { CMIdentity } from './feedTypes';
import { getWorkspaceConceptDetails, getWorkspaceConceptTitle } from './shared';

interface ProducedConceptCardProps {
  concept: CustomerConcept;
  conceptNotes: CustomerNote[];
  highlight: boolean;
  formatDate: (dateStr: string | null) => string;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  onAddConceptNote: (conceptId: string, content: string) => Promise<void>;
  cmDisplayNames: Record<string, CMIdentity>;
}

function formatCompactMetric(value: number | null): string | null {
  if (value == null) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace('.0', '')}k`;
  return String(value);
}

function formatWatchTime(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1).replace('.0', '')} h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds} s`;
}

export function ProducedConceptCard({
  concept,
  conceptNotes,
  highlight,
  formatDate,
  getConceptDetails,
  onAddConceptNote,
  cmDisplayNames,
}: ProducedConceptCardProps) {
  const details = getWorkspaceConceptDetails(concept, getConceptDetails);
  const [showResultNoteComposer, setShowResultNoteComposer] = React.useState(false);
  const [resultNoteText, setResultNoteText] = React.useState('');
  const [savingNote, setSavingNote] = React.useState(false);
  const markerIdentity = concept.cm_id ? cmDisplayNames[concept.cm_id] : null;
  const sortedConceptNotes = React.useMemo(
    () =>
      [...conceptNotes].sort((left, right) => {
        const leftTime = new Date(left.updated_at ?? left.created_at).getTime();
        const rightTime = new Date(right.updated_at ?? right.created_at).getTime();
        return rightTime - leftTime;
      }),
    [conceptNotes]
  );
  const stats = [
    concept.result.tiktok_views != null ? `${formatCompactMetric(concept.result.tiktok_views)} visningar` : null,
    concept.result.tiktok_likes != null ? `${formatCompactMetric(concept.result.tiktok_likes)} gilla` : null,
    concept.result.tiktok_comments != null ? `${formatCompactMetric(concept.result.tiktok_comments)} kommentarer` : null,
    concept.result.tiktok_watch_time_seconds != null ? `${formatWatchTime(concept.result.tiktok_watch_time_seconds)} watch time` : null,
  ].filter(Boolean);

  return (
    <article
      style={{
        background: highlight ? '#eefbf4' : LeTrendColors.surface,
        borderRadius: LeTrendRadius.lg,
        padding: 14,
        border: `1px solid ${highlight ? '#86efac' : LeTrendColors.border}`,
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}
    >
      {concept.result.tiktok_thumbnail_url ? (
        <img
          src={concept.result.tiktok_thumbnail_url}
          alt=""
          style={{
            width: 70,
            aspectRatio: '9 / 16',
            objectFit: 'cover',
            borderRadius: LeTrendRadius.md,
            flexShrink: 0,
            background: '#fff',
          }}
        />
      ) : (
        <div
          style={{
            width: 70,
            aspectRatio: '9 / 16',
            borderRadius: LeTrendRadius.md,
            background: '#f5f1eb',
            border: `1px solid ${LeTrendColors.border}`,
            flexShrink: 0,
          }}
        />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: LeTrendColors.brownDark, lineHeight: 1.4, marginBottom: 6 }}>
              {getWorkspaceConceptTitle(concept, details ?? null)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: LeTrendColors.textSecondary }}>
              {concept.result.produced_at ? <span>Producerad {formatDate(concept.result.produced_at)}</span> : null}
              {concept.result.tiktok_url ? (
                <a href={concept.result.tiktok_url} target="_blank" rel="noopener noreferrer" style={{ color: '#166534', fontWeight: 600, textDecoration: 'none' }}>
                  Publicerad{concept.result.published_at ? ` ${formatDate(concept.result.published_at)}` : ''} ↗
                </a>
              ) : concept.result.published_at ? (
                <span style={{ color: '#166534' }}>Publicerad {formatDate(concept.result.published_at)}</span>
              ) : null}
              {concept.updated_at ? <span>Senast redigerad {formatDate(concept.updated_at)}</span> : null}
            </div>
            {markerIdentity ? (
              <div style={{ marginTop: 6, fontSize: 11, color: LeTrendColors.textMuted }}>
                Producerad av {markerIdentity.name}
              </div>
            ) : null}
          </div>
          {highlight ? (
            <span style={{ padding: '4px 8px', borderRadius: 999, background: '#dcfce7', border: '1px solid #86efac', color: '#166534', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              Nyss producerad
            </span>
          ) : null}
        </div>

        {stats.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {stats.map((stat) => (
              <span
                key={stat}
                style={{
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: '#fff',
                  border: `1px solid ${LeTrendColors.border}`,
                  fontSize: 11,
                  color: LeTrendColors.textSecondary,
                }}
              >
                {stat}
              </span>
            ))}
          </div>
        ) : null}

        <div style={{ marginTop: 10 }}>
          {!showResultNoteComposer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setShowResultNoteComposer(true)}
                style={{
                  border: `1px solid ${LeTrendColors.border}`,
                  background: '#fff',
                  color: LeTrendColors.brownDark,
                  padding: '6px 10px',
                  borderRadius: LeTrendRadius.md,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {sortedConceptNotes.length > 0
                  ? `Visa resultatnotering (${sortedConceptNotes.length})`
                  : 'Lägg till resultatnotering'}
              </button>
              {sortedConceptNotes.length > 0 ? (
                <span style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
                  Senaste {formatDate(sortedConceptNotes[0]?.updated_at ?? sortedConceptNotes[0]?.created_at ?? null)}
                </span>
              ) : null}
            </div>
          ) : (
            <div>
              {sortedConceptNotes.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  {sortedConceptNotes.slice(0, 3).map((note) => (
                    <div
                      key={note.id}
                      style={{
                        padding: '9px 10px',
                        borderRadius: LeTrendRadius.md,
                        background: '#fff',
                        border: `1px solid ${LeTrendColors.border}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: LeTrendColors.textPrimary,
                          lineHeight: 1.55,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {note.content}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 11, color: LeTrendColors.textMuted }}>
                        {formatDate(note.updated_at ?? note.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <textarea
                value={resultNoteText}
                onChange={(event) => setResultNoteText(event.target.value)}
                rows={3}
                placeholder="Vad vill du spara om utfallet eller kundens resultat?"
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: LeTrendRadius.sm,
                  border: `1px solid ${LeTrendColors.border}`,
                  fontSize: 13,
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  background: '#fff',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  disabled={savingNote || !resultNoteText.trim()}
                  onClick={async () => {
                    if (!resultNoteText.trim() || savingNote) return;
                    setSavingNote(true);
                    await onAddConceptNote(concept.id, resultNoteText);
                    setSavingNote(false);
                    setResultNoteText('');
                    setShowResultNoteComposer(false);
                  }}
                  style={{
                    padding: '6px 12px',
                    background: LeTrendColors.brownLight,
                    color: '#fff',
                    border: 'none',
                    borderRadius: LeTrendRadius.sm,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: resultNoteText.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  {savingNote ? 'Sparar...' : 'Spara'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowResultNoteComposer(false);
                    setResultNoteText('');
                  }}
                  style={{
                    padding: '6px 12px',
                    background: '#fff',
                    color: LeTrendColors.brownDark,
                    border: `1px solid ${LeTrendColors.border}`,
                    borderRadius: LeTrendRadius.sm,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Avbryt
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
