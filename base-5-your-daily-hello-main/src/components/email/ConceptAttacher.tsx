'use client';

import React, { useMemo, useState } from 'react';
import type { CustomerConcept } from '@/types/studio-v2';
import type { TranslatedConcept } from '@/lib/translator';
import {
  LeTrendColors,
  LeTrendGradients,
  LeTrendRadius,
  LeTrendTypography,
} from '@/styles/letrend-design-system';
import {
  getWorkspaceConceptDetails,
  getWorkspaceConceptTitle,
} from '@/components/studio/customer-detail/shared';

type ConceptAttacherProps = {
  concepts: CustomerConcept[];
  selectedConceptIds: string[];
  setSelectedConceptIds: React.Dispatch<React.SetStateAction<string[]>>;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  maxConcepts: number;
};

export function ConceptAttacher({
  concepts,
  selectedConceptIds,
  setSelectedConceptIds,
  getConceptDetails,
  maxConcepts,
}: ConceptAttacherProps) {
  const [query, setQuery] = useState('');

  const conceptsById = useMemo(
    () => new Map(concepts.map((concept) => [concept.id, concept])),
    [concepts]
  );

  const selectedConcepts = useMemo(
    () => selectedConceptIds
      .map((id) => conceptsById.get(id))
      .filter((concept): concept is CustomerConcept => Boolean(concept)),
    [conceptsById, selectedConceptIds]
  );

  const filteredConcepts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return concepts;
    }

    return concepts.filter((concept) => {
      const details = getWorkspaceConceptDetails(concept, getConceptDetails);
      const title = getWorkspaceConceptTitle(concept, details ?? null).toLowerCase();
      const whyItWorks = (details?.whyItWorks_sv || '').toLowerCase();
      return title.includes(normalizedQuery) || whyItWorks.includes(normalizedQuery);
    });
  }, [concepts, getConceptDetails, query]);

  const handleToggleConcept = (conceptId: string) => {
    setSelectedConceptIds((current) => {
      if (current.includes(conceptId)) {
        return current.filter((id) => id !== conceptId);
      }

      if (current.length >= maxConcepts) {
        return current;
      }

      return [...current, conceptId];
    });
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: LeTrendColors.brownSubtle }}>
            Bifoga koncept
          </div>
          <div style={{ fontSize: 12, color: LeTrendColors.textMuted, marginTop: 2 }}>
            {selectedConceptIds.length} av {maxConcepts} valda
          </div>
        </div>
        <div
          style={{
            padding: '6px 10px',
            borderRadius: LeTrendRadius.pill,
            background: LeTrendColors.surfaceHighlight,
            color: LeTrendColors.brownSubtle,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          + Lägg till
        </div>
      </div>

      {selectedConcepts.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 12,
          }}
        >
          {selectedConcepts.map((concept) => {
            const details = getWorkspaceConceptDetails(concept, getConceptDetails);
            const title = getWorkspaceConceptTitle(concept, details ?? null);
            const match = details?.matchPercentage ?? 85;

            return (
              <div
                key={concept.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: LeTrendRadius.pill,
                  background: '#FFFFFF',
                  border: `1px solid ${LeTrendColors.borderStrong}`,
                  color: LeTrendColors.brownDark,
                  fontSize: 12,
                }}
              >
                <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {title}
                </span>
                <span style={{ color: LeTrendColors.success, fontWeight: 700 }}>{match}%</span>
                <button
                  type="button"
                  onClick={() => handleToggleConcept(concept.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: LeTrendColors.textSecondary,
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Sök bland kundens koncept"
        style={{
          width: '100%',
          padding: '14px 16px',
          borderRadius: 12,
          border: '1px solid rgba(74,47,24,0.15)',
          background: '#FFFFFF',
          color: LeTrendColors.textPrimary,
          fontSize: 14,
          marginBottom: 10,
        }}
      />

      <div
        style={{
          borderRadius: 14,
          border: `1px solid ${LeTrendColors.borderStrong}`,
          background: '#FFFFFF',
          maxHeight: 240,
          overflowY: 'auto',
          padding: 8,
        }}
      >
        {filteredConcepts.length === 0 ? (
          <div style={{ padding: 16, color: LeTrendColors.textMuted, fontSize: 13 }}>
            Inga koncept matchar sökningen.
          </div>
        ) : (
          filteredConcepts.map((concept) => {
            const details = getWorkspaceConceptDetails(concept, getConceptDetails);
            const title = getWorkspaceConceptTitle(concept, details ?? null);
            const match = details?.matchPercentage ?? 85;
            const isSelected = selectedConceptIds.includes(concept.id);
            const isDisabled = !isSelected && selectedConceptIds.length >= maxConcepts;

            return (
              <button
                key={concept.id}
                type="button"
                onClick={() => handleToggleConcept(concept.id)}
                disabled={isDisabled}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: isSelected ? `1px solid ${LeTrendColors.brownLight}` : '1px solid transparent',
                  background: isSelected ? LeTrendColors.surfaceHighlight : '#FFFFFF',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  opacity: isDisabled ? 0.55 : 1,
                  textAlign: 'left',
                  marginBottom: 6,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: LeTrendColors.brownDark,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {title}
                  </div>
                  <div style={{ fontSize: 12, color: LeTrendColors.textMuted, marginTop: 2 }}>
                    {concept.result.sent_at ? 'Tidigare delat' : 'Redo att delas'}
                  </div>
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    padding: '4px 10px',
                    borderRadius: LeTrendRadius.pill,
                    background: isSelected ? LeTrendGradients.gradientSuccess : 'rgba(16, 185, 129, 0.08)',
                    color: isSelected ? '#FFFFFF' : LeTrendColors.success,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {match}%
                </div>
              </button>
            );
          })
        )}
      </div>
      <div
        style={{
          fontSize: LeTrendTypography.fontSize.xs,
          color: LeTrendColors.textMuted,
          marginTop: 8,
        }}
      >
        Bara kundens faktiska tilldelade koncept visas här.
      </div>
    </div>
  );
}
