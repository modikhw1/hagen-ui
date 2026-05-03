'use client';

import React from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CustomerConcept } from '@/types/studio-v2';

export type MarkProducedMode = 'auto' | 'manual' | 'skip';

export interface MarkProducedDialogProps {
  isOpen: boolean;
  onClose: () => void;
  nuConceptId: string;
  importedConcepts: CustomerConcept[];
  freshestImportedConcept: CustomerConcept | null;
  onMarkProduced: (
    conceptId: string,
    tiktokUrl?: string,
    publishedAt?: string,
  ) => Promise<void>;
  onReconcileHistory: (
    historyConceptId: string,
    options?: { mode?: 'use_now_slot'; linkedCustomerConceptId?: string },
  ) => Promise<void>;
}

const RADIO_OPTION: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '10px 12px',
  borderRadius: LeTrendRadius.md,
  border: `1px solid ${LeTrendColors.border}`,
  cursor: 'pointer',
  transition: 'background 0.12s',
};

const SELECTED_RADIO: React.CSSProperties = {
  ...RADIO_OPTION,
  background: 'rgba(74,47,24,0.06)',
  borderColor: '#4A2F18',
};

export function MarkProducedDialog({
  isOpen,
  onClose,
  nuConceptId,
  importedConcepts,
  freshestImportedConcept,
  onMarkProduced,
  onReconcileHistory,
}: MarkProducedDialogProps) {
  const [mode, setMode] = React.useState<MarkProducedMode>('auto');
  const [selectedClipId, setSelectedClipId] = React.useState('');
  const [cmNote, setCmNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    setMode('auto');
    setSelectedClipId(freshestImportedConcept?.id ?? '');
    setCmNote('');
    setSubmitting(false);
    setSubmitError(null);
  }, [isOpen, freshestImportedConcept?.id]);

  if (!isOpen) {
    return null;
  }

  const handleConfirm = async () => {
    setSubmitError(null);
    setSubmitting(true);

    try {
      if (mode === 'auto') {
        const clip = freshestImportedConcept;
        await onMarkProduced(
          nuConceptId,
          clip?.result.tiktok_url ?? undefined,
          clip?.result.published_at ?? undefined,
        );
      } else if (mode === 'manual') {
        const clip = importedConcepts.find((concept) => concept.id === selectedClipId) ?? null;

        if (clip) {
          await onReconcileHistory(clip.id, { mode: 'use_now_slot' });
        }

        await onMarkProduced(
          nuConceptId,
          clip?.result.tiktok_url ?? undefined,
          clip?.result.published_at ?? undefined,
        );
      } else {
        await onMarkProduced(nuConceptId);
      }

      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Okant fel');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26,22,18,0.38)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: LeTrendRadius.lg,
          padding: 28,
          width: '100%',
          maxWidth: 480,
          boxShadow: '0 20px 60px rgba(26,22,18,0.18)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#4A2F18' }}>
            Markera som gjord
          </h3>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: LeTrendColors.textMuted,
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {submitError ? (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 12px',
              borderRadius: LeTrendRadius.md,
              border: '1px solid #e7b7b7',
              background: '#fff5f5',
              color: '#9f2d2d',
              fontSize: 12,
            }}
          >
            {submitError}
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <div
            role="radio"
            aria-checked={mode === 'auto'}
            onClick={() => setMode('auto')}
            style={mode === 'auto' ? SELECTED_RADIO : RADIO_OPTION}
          >
            <div style={{ marginTop: 2 }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: `2px solid ${mode === 'auto' ? '#4A2F18' : LeTrendColors.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {mode === 'auto' ? (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#4A2F18',
                    }}
                  />
                ) : null}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#4A2F18' }}>
                Kunden filmade ratt koncept
              </div>
              <div style={{ fontSize: 11, color: LeTrendColors.textMuted, marginTop: 2 }}>
                {freshestImportedConcept
                  ? 'Kopplar senaste importerade klippet till konceptet.'
                  : 'Markerar som producerat utan klippkoppling.'}
              </div>
            </div>
          </div>

          <div
            role="radio"
            aria-checked={mode === 'manual'}
            onClick={() => setMode('manual')}
            style={mode === 'manual' ? SELECTED_RADIO : RADIO_OPTION}
          >
            <div style={{ marginTop: 2 }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: `2px solid ${mode === 'manual' ? '#4A2F18' : LeTrendColors.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {mode === 'manual' ? (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#4A2F18',
                    }}
                  />
                ) : null}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#4A2F18' }}>
                Kunden filmade ett annat koncept
              </div>
              <div style={{ fontSize: 11, color: LeTrendColors.textMuted, marginTop: 2 }}>
                Valj vilket importerat klipp som ska kopplas.
              </div>
              {mode === 'manual' ? (
                <select
                  value={selectedClipId}
                  onChange={(event) => setSelectedClipId(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    border: `1px solid ${LeTrendColors.border}`,
                    borderRadius: LeTrendRadius.sm,
                    padding: '6px 8px',
                    fontSize: 12,
                    background: '#fff',
                    color: '#4A2F18',
                  }}
                >
                  <option value="">Valj klipp...</option>
                  {importedConcepts.map((concept) => {
                    const date = concept.result.published_at
                      ? new Date(concept.result.published_at).toLocaleDateString('sv-SE', {
                          day: 'numeric',
                          month: 'short',
                        })
                      : '';
                    const url = concept.result.tiktok_url ?? '';
                    const label = [date, url].filter(Boolean).join(' · ');

                    return (
                      <option key={concept.id} value={concept.id}>
                        {label || concept.id.slice(-8)}
                      </option>
                    );
                  })}
                </select>
              ) : null}
            </div>
          </div>

          <div
            role="radio"
            aria-checked={mode === 'skip'}
            onClick={() => setMode('skip')}
            style={mode === 'skip' ? SELECTED_RADIO : RADIO_OPTION}
          >
            <div style={{ marginTop: 2 }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: `2px solid ${mode === 'skip' ? '#4A2F18' : LeTrendColors.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {mode === 'skip' ? (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#4A2F18',
                    }}
                  />
                ) : null}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#4A2F18' }}>
                Hoppa over / manuell hantering
              </div>
              <div style={{ fontSize: 11, color: LeTrendColors.textMuted, marginTop: 2 }}>
                Markera nu-kortet som gjort utan att koppla ett klipp.
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: LeTrendColors.textMuted,
              display: 'block',
              marginBottom: 4,
            }}
          >
            Anteckning (valfri)
          </label>
          <textarea
            value={cmNote}
            onChange={(event) => setCmNote(event.target.value)}
            placeholder="Lagg till en intern notering..."
            rows={2}
            style={{
              width: '100%',
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.sm,
              padding: '7px 10px',
              fontSize: 12,
              color: '#4A2F18',
              fontFamily: 'inherit',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '8px 18px',
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              background: '#fff',
              fontSize: 13,
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: LeTrendColors.textSecondary,
              fontFamily: 'inherit',
            }}
          >
            Avbryt
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={submitting || (mode === 'manual' && !selectedClipId)}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderRadius: LeTrendRadius.md,
              background:
                submitting || (mode === 'manual' && !selectedClipId)
                  ? '#9ca3af'
                  : '#4A2F18',
              color: '#FAF8F5',
              fontSize: 13,
              fontWeight: 600,
              cursor:
                submitting || (mode === 'manual' && !selectedClipId)
                  ? 'not-allowed'
                  : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {submitting ? 'Markerar...' : 'Bekrafta'}
          </button>
        </div>
      </div>
    </div>
  );
}
