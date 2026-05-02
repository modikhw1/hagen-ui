'use client';

import React from 'react';
import type { CustomerConcept } from '@/types/studio-v2';
import type { TranslatedConcept } from '@/lib/translator';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import { getWorkspaceConceptDetails, getWorkspaceConceptTitle } from './shared';

type DraftConceptPickerProps = {
  drafts: CustomerConcept[];
  showConceptPicker: boolean;
  onToggle: () => void;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
};

export const DraftConceptPicker = React.memo(function DraftConceptPicker({
  drafts,
  showConceptPicker,
  onToggle,
  getConceptDetails,
}: DraftConceptPickerProps) {
  if (drafts.length === 0) return null;

  return (
    <div
      style={{
        marginBottom: 16,
        background: 'white',
        border: `1px solid ${LeTrendColors.border}`,
        borderRadius: LeTrendRadius.md,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: 'white',
          border: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          color: LeTrendColors.brownDark,
        }}
      >
        <span>Odelade kunduppdrag ({drafts.length})</span>
        <span style={{ fontSize: 16 }}>{showConceptPicker ? '−' : '+'}</span>
      </button>

      {showConceptPicker ? (
        <div
          style={{
            padding: '8px 12px 12px',
            maxHeight: 300,
            overflow: 'auto',
            background: '#FAFAFA',
          }}
        >
          <div style={{ fontSize: 11, color: LeTrendColors.textMuted, marginBottom: 8, paddingLeft: 4 }}>
            Dra ett kunduppdrag till en tom slot. Om du vill välja plats först, klicka på en tom slot i planen.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {drafts.map((concept) => {
              const details = getWorkspaceConceptDetails(concept, getConceptDetails);

              return (
                <div
                  key={concept.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/concept-id', concept.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  style={{
                    background: 'white',
                    border: `1px solid ${LeTrendColors.border}`,
                    borderRadius: LeTrendRadius.sm,
                    padding: '10px 12px',
                    textAlign: 'left',
                    cursor: 'grab',
                    transition: 'all 0.15s',
                    fontSize: 13,
                    color: LeTrendColors.brownDark,
                    fontWeight: 500,
                    userSelect: 'none',
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.borderColor = LeTrendColors.brownLight;
                    event.currentTarget.style.background = '#F9FAFB';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.borderColor = LeTrendColors.border;
                    event.currentTarget.style.background = 'white';
                  }}
                >
                  {getWorkspaceConceptTitle(concept, details ?? null)}
                  <span style={{ fontSize: 10, color: LeTrendColors.textMuted, marginLeft: 8 }}>
                    dra till tom kommande slot
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
});
