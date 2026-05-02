import React from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';

interface CustomerConceptDetailProps {
  script: string;
  whyItWorks: string;
  instructions: string;
}

function ConceptBlock({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: LeTrendRadius.md,
        border: `1px solid ${LeTrendColors.border}`,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, color: LeTrendColors.textSecondary, marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontSize: 14,
          color: LeTrendColors.textPrimary,
          whiteSpace: 'pre-wrap',
          lineHeight: 1.5,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function CustomerConceptDetail({
  script,
  whyItWorks,
  instructions,
}: CustomerConceptDetailProps) {
  return (
    <div style={{ marginTop: 16 }}>
      <ConceptBlock label="Manus" value={script || 'Inget manus tillagt'} />
      <div style={{ height: 10 }} />
      <ConceptBlock label="Varför det funkar" value={whyItWorks || 'Inga argument tillagda'} />
      <div style={{ height: 10 }} />
      <ConceptBlock label="Instruktioner" value={instructions || 'Inga instruktioner tillagda'} />
    </div>
  );
}
