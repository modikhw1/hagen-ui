import React from 'react';
import {
  getStudioCustomerConceptDisplayTitle,
  getStudioCustomerConceptSourceConceptId,
} from '@/lib/studio/customer-concepts';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { TranslatedConcept } from '@/lib/translator';
import { resolveConceptContent, type ConceptSectionKey } from '@/lib/studio-v2-concept-content';
import type { CustomerConcept } from '@/types/studio-v2';
import type { CustomerConceptAssignmentStatus } from '@/types/customer-lifecycle';
import { CustomerConceptDetail } from './CustomerConceptDetail';
import { CustomerConceptStatusEditor } from './CustomerConceptStatusEditor';

interface CustomerConceptsListProps {
  concepts: CustomerConcept[];
  expandedConceptId: string | null;
  setExpandedConceptId: (conceptId: string | null) => void;
  handleDeleteConcept: (conceptId: string) => Promise<void>;
  handleChangeStatus: (
    conceptId: string,
    newStatus: CustomerConceptAssignmentStatus
  ) => Promise<void>;
  openConceptEditor: (conceptId: string, sections?: ConceptSectionKey[]) => void;
  setShowAddConceptPanel: (show: boolean) => void;
  formatDate: (dateStr: string) => string;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
}

export function CustomerConceptsList({
  concepts,
  expandedConceptId,
  setExpandedConceptId,
  handleDeleteConcept,
  handleChangeStatus,
  openConceptEditor,
  setShowAddConceptPanel,
  formatDate,
  getConceptDetails,
}: CustomerConceptsListProps) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: LeTrendRadius.lg,
        padding: 24,
        border: `1px solid ${LeTrendColors.border}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: LeTrendColors.brownDark,
            margin: 0,
          }}
        >
          Koncept
        </h2>
        <button
          onClick={() => setShowAddConceptPanel(true)}
          style={{
            padding: '10px 16px',
            background: LeTrendColors.success,
            color: '#fff',
            border: 'none',
            borderRadius: LeTrendRadius.md,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Lägg till koncept
        </button>
      </div>

      {concepts.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 60,
            color: LeTrendColors.textMuted,
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>[ ]</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Inga koncept ännu</div>
          <div style={{ fontSize: 14 }}>Lägg till ett koncept för att komma igång.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {concepts.map((concept) => {
            const sourceConceptId = getStudioCustomerConceptSourceConceptId(concept);
            const details = sourceConceptId ? getConceptDetails(sourceConceptId) : undefined;
            const resolved = resolveConceptContent(concept, details ?? null);
            const isExpanded = expandedConceptId === concept.id;

            return (
              <div
                key={concept.id}
                style={{
                  background: LeTrendColors.surface,
                  borderRadius: LeTrendRadius.lg,
                  padding: 16,
                  border: `1px solid ${LeTrendColors.border}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: isExpanded ? 16 : 0,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h3
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                      color: LeTrendColors.brownDark,
                      margin: '0 0 8px',
                      }}
                    >
                      {getStudioCustomerConceptDisplayTitle(
                        concept,
                        details?.headline_sv || details?.headline || null
                      )}
                    </h3>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
                      <CustomerConceptStatusEditor
                        conceptId={concept.id}
                        status={concept.status}
                        onChangeStatus={handleChangeStatus}
                      />
                      <span style={{ color: LeTrendColors.textMuted }}>
                        Tillagd: {formatDate(concept.added_at)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setExpandedConceptId(isExpanded ? null : concept.id)}
                      style={{
                        background: 'none',
                        border: `1px solid ${LeTrendColors.border}`,
                        padding: '6px 12px',
                        borderRadius: LeTrendRadius.md,
                        cursor: 'pointer',
                        fontSize: 12,
                        color: LeTrendColors.brownLight,
                        fontWeight: 600,
                      }}
                    >
                      {isExpanded ? 'Dölj' : 'Visa'}
                    </button>
                    <button
                      onClick={() => openConceptEditor(concept.id)}
                      style={{
                        background: LeTrendColors.brownLight,
                        border: 'none',
                        color: '#fff',
                        padding: '6px 12px',
                        borderRadius: LeTrendRadius.md,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Redigera
                    </button>
                    <button
                      onClick={() => void handleDeleteConcept(concept.id)}
                      style={{
                        background: 'none',
                        border: '1px solid #ef4444',
                        color: '#ef4444',
                        padding: '6px 12px',
                        borderRadius: LeTrendRadius.md,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Ta bort
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <CustomerConceptDetail
                    script={resolved.script.script_sv || ''}
                    whyItWorks={resolved.fit.whyItWorks_sv || ''}
                    instructions={resolved.instructions.filming_instructions || ''}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
