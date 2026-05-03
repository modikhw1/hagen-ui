import React from 'react';
import { FeedTimeline } from '@/components/studio/FeedTimeline';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CustomerConcept } from '@/types/studio-v2';

interface CustomerDemoPanelProps {
  customerId: string;
  concepts: CustomerConcept[];
  onOpenImportHistory: () => void;
}

export function CustomerDemoPanel({
  customerId,
  concepts,
  onOpenImportHistory,
}: CustomerDemoPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: LeTrendColors.brownDark,
              margin: 0,
            }}
          >
            Demo-förberedelse
          </h2>
          <p style={{ fontSize: 13, color: LeTrendColors.textSecondary, margin: '4px 0 0' }}>
            Pre-seeda feedplanen och förbered kundanpassad demo-sida.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={onOpenImportHistory}
            style={{
              padding: '8px 14px',
              background: LeTrendColors.surface,
              border: `1px solid ${LeTrendColors.borderMedium}`,
              borderRadius: LeTrendRadius.md,
              fontSize: 13,
              fontWeight: 500,
              color: LeTrendColors.textPrimary,
              cursor: 'pointer',
            }}
          >
            + Importera TikTok-historik
          </button>
          <a
            href={`/demo/${customerId}`}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '8px 14px',
              background: LeTrendColors.brownLight,
              border: 'none',
              borderRadius: LeTrendRadius.md,
              fontSize: 13,
              fontWeight: 600,
              color: LeTrendColors.cream,
              cursor: 'pointer',
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Öppna demo-sida ↗
          </a>
        </div>
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: LeTrendRadius.lg,
          border: `1px solid ${LeTrendColors.border}`,
          padding: '20px 20px 16px',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: LeTrendColors.textSecondary,
            marginBottom: 16,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Feed-tidslinje
        </div>
        <FeedTimeline
          concepts={concepts.filter((concept) => concept.placement.feed_order !== null)}
          onAddHistory={onOpenImportHistory}
        />
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: LeTrendRadius.lg,
          border: `1px solid ${LeTrendColors.border}`,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: LeTrendColors.textMuted,
              letterSpacing: '0.06em',
              marginBottom: 4,
            }}
          >
            PUBLIK DEMO-URL
          </div>
          <code
            style={{
              fontSize: 13,
              color: LeTrendColors.textPrimary,
              background: LeTrendColors.surface,
              padding: '4px 8px',
              borderRadius: 4,
              display: 'block',
              wordBreak: 'break-all',
            }}
          >
            {typeof window !== 'undefined' ? window.location.origin : ''}/demo/{customerId}
          </code>
        </div>
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              void navigator.clipboard.writeText(`${window.location.origin}/demo/${customerId}`);
            }
          }}
          style={{
            padding: '8px 14px',
            background: LeTrendColors.surface,
            border: `1px solid ${LeTrendColors.borderMedium}`,
            borderRadius: LeTrendRadius.md,
            fontSize: 12,
            fontWeight: 500,
            color: LeTrendColors.textSecondary,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Kopiera
        </button>
      </div>
    </div>
  );
}
