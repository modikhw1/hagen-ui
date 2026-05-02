'use client';

import React from 'react';
import type { MotorSignalKind } from '@/lib/studio/motor-signal';
import { LeTrendRadius } from '@/styles/letrend-design-system';

type FeedReviewBannerProps = {
  cueKind: MotorSignalKind;
  focusedEvidenceCount: number;
  deferredAdvanceCue: boolean;
  onResumeCue: () => void;
  onClose: () => void;
};

export const FeedReviewBanner = React.memo(function FeedReviewBanner({
  cueKind,
  focusedEvidenceCount,
  deferredAdvanceCue,
  onResumeCue,
  onClose,
}: FeedReviewBannerProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 6,
        padding: '5px 10px',
        background: 'rgba(22,101,52,0.06)',
        border: '1px solid rgba(22,101,52,0.18)',
        borderRadius: LeTrendRadius.sm,
        fontSize: 11,
        color: '#166534',
      }}
    >
      <span style={{ opacity: 0.75, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span>
          Granskningsläge
          {' · '}
          {focusedEvidenceCount} {cueKind === 'fresh_activity' ? 'nya' : 'historiska'} klipp markerade med{' '}
          <strong style={{ fontWeight: 700 }}>nytt</strong>
        </span>
        {deferredAdvanceCue && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ opacity: 0.6 }}>signal pausad</span>
            <button
              onClick={onResumeCue}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 11,
                color: '#166534',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >
              Återuppta
            </button>
          </>
        )}
      </span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          fontSize: 13,
          lineHeight: 1,
          color: '#166534',
          opacity: 0.45,
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
        }}
        title="Stäng granskningsläge"
      >
        ×
      </button>
    </div>
  );
});
