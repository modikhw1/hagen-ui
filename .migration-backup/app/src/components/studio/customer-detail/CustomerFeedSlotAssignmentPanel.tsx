import React from 'react';
import { SidePanel } from '@/components/studio-v2/SidePanel';
import { getCustomerConceptPlacementLabel } from '@/lib/customer-concept-lifecycle';
import {
  getStudioCustomerConceptDisplayTitle,
  getStudioCustomerConceptSourceConceptId,
} from '@/lib/studio/customer-concepts';
import type { TranslatedConcept } from '@/lib/translator';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CustomerConcept } from '@/types/studio-v2';

interface CustomerFeedSlotAssignmentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFeedSlot: number | null;
  draftConcepts: CustomerConcept[];
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  onAssignToFeedOrder: (conceptId: string, feedOrder: number) => Promise<void>;
}

export function CustomerFeedSlotAssignmentPanel({
  isOpen,
  onClose,
  selectedFeedSlot,
  draftConcepts,
  getConceptDetails,
  onAssignToFeedOrder,
}: CustomerFeedSlotAssignmentPanelProps) {
  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={`Välj koncept för position ${
        selectedFeedSlot !== null ? `${selectedFeedSlot > 0 ? '+' : ''}${selectedFeedSlot}` : ''
      }`}
    >
      {selectedFeedSlot !== null && (
        <p style={{ margin: '0 0 12px', fontSize: 12, color: LeTrendColors.textSecondary }}>
          {getCustomerConceptPlacementLabel(selectedFeedSlot, 'studio') ?? 'Planen'}
        </p>
      )}

      {draftConcepts.length === 0 ? (
        <p style={{ color: LeTrendColors.textSecondary, fontSize: 14 }}>
          Inga ej-placerade utkast finns. Lägg till koncept från biblioteket först.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {draftConcepts.map((concept) => {
            const sourceConceptId = getStudioCustomerConceptSourceConceptId(concept);
            const details = sourceConceptId ? getConceptDetails(sourceConceptId) : undefined;

            return (
              <button
                key={concept.id}
                onClick={() => {
                  if (selectedFeedSlot === null) return;
                  void onAssignToFeedOrder(concept.id, selectedFeedSlot);
                }}
                style={{
                  background: '#fff',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.md,
                  padding: 16,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                  color: LeTrendColors.brownDark,
                  }}
                >
                  {getStudioCustomerConceptDisplayTitle(
                    concept,
                    details?.headline_sv || details?.headline || null
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </SidePanel>
  );
}
