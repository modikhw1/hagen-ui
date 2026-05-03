'use client';

import {
  getCustomerConceptPlacementLabel,
  getStudioFeedOrderDescription,
  getStudioFeedOrderLabel,
} from '@/lib/customer-concept-lifecycle';
import {
  getStudioCustomerConceptDisplayTitle,
} from '@/lib/studio/customer-concepts';
import type { CustomerConcept } from '@/types/studio-v2';

interface SlotPopupModalProps {
  slotData: {
    slot: { feedOrder: number };
    concept: Pick<CustomerConcept, 'id' | 'concept_id' | 'row_kind' | 'assignment'> | null;
    details: { headline?: string; headline_sv?: string } | null;
  };
  onClose: () => void;
  onAddConcept: () => void;
}

export function SlotPopupModal({ slotData, onClose, onAddConcept }: SlotPopupModalProps) {
  const title = slotData.concept
    ? getStudioCustomerConceptDisplayTitle(
        slotData.concept,
        slotData.details?.headline_sv || slotData.details?.headline || null
      )
    : 'Tom plan-slot';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(26,22,18,0.32)',
      }}
    >
      <div
        style={{
          width: 'min(480px, calc(100vw - 32px))',
          background: '#fff',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 20px 60px rgba(26,22,18,0.18)',
        }}
      >
        <h3 style={{ margin: '0 0 10px', fontSize: 20, color: '#4A2F18' }}>{title}</h3>
        <p style={{ margin: '0 0 18px', color: '#7D6E5D', fontSize: 14 }}>
          {getStudioFeedOrderLabel(slotData.slot.feedOrder)}
        </p>
        <p style={{ margin: '0 0 18px', color: '#7D6E5D', fontSize: 13, lineHeight: 1.6 }}>
          {getCustomerConceptPlacementLabel(slotData.slot.feedOrder, 'studio') ?? 'Planen'}.
          {' '}
          {getStudioFeedOrderDescription(slotData.slot.feedOrder)}.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          {!slotData.concept && (
            <button
              type="button"
              onClick={onAddConcept}
              style={{ border: 'none', borderRadius: 10, background: '#4A2F18', color: '#fff', padding: '10px 14px', fontWeight: 700 }}
            >
              Välj kunduppdrag
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{ border: '1px solid rgba(74,47,24,0.14)', borderRadius: 10, background: '#fff', color: '#4A2F18', padding: '10px 14px', fontWeight: 700 }}
          >
            Stäng
          </button>
        </div>
      </div>
    </div>
  );
}
