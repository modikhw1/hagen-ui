'use client';

import { useEffect, useState } from 'react';
import type { CustomerConcept } from '@/types/studio-v2';
import type { TranslatedConcept } from '@/lib/translator';
import type { ConceptSectionKey } from '@/lib/studio-v2-concept-content';
import { SidePanel } from './SidePanel';

interface ConceptEditWizardProps {
  isOpen: boolean;
  concept: CustomerConcept | null;
  details?: TranslatedConcept;
  initialSections?: ConceptSectionKey[];
  onClose: () => void;
  onSave: (conceptId: string, updates: Partial<CustomerConcept>) => Promise<void>;
}

export function ConceptEditWizard({
  isOpen,
  concept,
  details,
  initialSections,
  onClose,
  onSave,
}: ConceptEditWizardProps) {
  const [headline, setHeadline] = useState('');
  const [script, setScript] = useState('');
  const [whyItFits, setWhyItFits] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!concept) return;
    const overrides = (concept.content_overrides || {}) as Record<string, string | undefined>;
    setHeadline(overrides.headline || details?.headline_sv || details?.headline || '');
    setScript(overrides.script || details?.script_sv || '');
    setWhyItFits(overrides.why_it_fits || details?.whyItWorks_sv || '');
    setInstructions(overrides.filming_instructions || '');
  }, [concept, details, initialSections]);

  if (!concept) return null;

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="Edit concept">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#7D6E5D' }}>
          Headline
          <input
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            style={{ borderRadius: 10, border: '1px solid rgba(74,47,24,0.12)', padding: '10px 12px', fontSize: 14 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#7D6E5D' }}>
          Script
          <textarea
            rows={7}
            value={script}
            onChange={(event) => setScript(event.target.value)}
            style={{ borderRadius: 10, border: '1px solid rgba(74,47,24,0.12)', padding: '10px 12px', fontSize: 14 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#7D6E5D' }}>
          Why it works
          <textarea
            rows={4}
            value={whyItFits}
            onChange={(event) => setWhyItFits(event.target.value)}
            style={{ borderRadius: 10, border: '1px solid rgba(74,47,24,0.12)', padding: '10px 12px', fontSize: 14 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#7D6E5D' }}>
          Filming instructions
          <textarea
            rows={4}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            style={{ borderRadius: 10, border: '1px solid rgba(74,47,24,0.12)', padding: '10px 12px', fontSize: 14 }}
          />
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(concept.id, {
                  content_overrides: {
                    ...(concept.content_overrides || {}),
                    headline,
                    script,
                    why_it_fits: whyItFits,
                    filming_instructions: instructions,
                  },
                });
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            style={{
              border: 'none',
              borderRadius: 10,
              background: '#4A2F18',
              color: '#fff',
              padding: '10px 14px',
              fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
            }}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: '1px solid rgba(74,47,24,0.14)',
              borderRadius: 10,
              background: '#fff',
              color: '#4A2F18',
              padding: '10px 14px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </SidePanel>
  );
}
