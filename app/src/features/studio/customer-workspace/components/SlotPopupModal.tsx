'use client';

interface SlotPopupModalProps {
  slotData: {
    slot: { feedOrder: number };
    concept: { concept_id: string } | null;
    details: { headline?: string; headline_sv?: string } | null;
  };
  onClose: () => void;
  onAddConcept: () => void;
}

export function SlotPopupModal({ slotData, onClose, onAddConcept }: SlotPopupModalProps) {
  const title = slotData.details?.headline_sv || slotData.details?.headline || slotData.concept?.concept_id || 'Empty slot';

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
          Feed position: {slotData.slot.feedOrder}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          {!slotData.concept && (
            <button
              type="button"
              onClick={onAddConcept}
              style={{ border: 'none', borderRadius: 10, background: '#4A2F18', color: '#fff', padding: '10px 14px', fontWeight: 700 }}
            >
              Add concept
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{ border: '1px solid rgba(74,47,24,0.14)', borderRadius: 10, background: '#fff', color: '#4A2F18', padding: '10px 14px', fontWeight: 700 }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
