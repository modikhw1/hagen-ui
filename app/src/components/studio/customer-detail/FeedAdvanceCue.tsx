'use client';

import React from 'react';
import type { CustomerConcept } from '@/types/studio-v2';
import type { MotorSignalKind } from '@/lib/studio/motor-signal';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';

type FeedAdvanceCueProps = {
  cue: {
    imported: number;
    kind: MotorSignalKind;
    publishedAt: string | null;
  };
  cueSignalId?: string;
  activeNudgesCount: number;
  hasActivePlan: boolean;
  nuConcept: CustomerConcept | null;
  freshImportedConcepts: CustomerConcept[];
  freshImportedIds: ReadonlySet<string>;
  focusedEvidenceCount: number;
  advancingPlan: boolean;
  markingProducedFromCue: boolean;
  showCueOverflowMenu: boolean;
  onReviewHistory: () => void;
  onDefer: () => void;
  onToggleOverflow: () => void;
  onMarkProducedFromCue: () => void;
  onAdvancePlan: () => void;
  onDismissCue: (signalId?: string) => void;
  formatCompactViews: (count: number) => string;
};

export const FeedAdvanceCue = React.memo(function FeedAdvanceCue({
  cue,
  cueSignalId,
  activeNudgesCount,
  hasActivePlan,
  nuConcept,
  freshImportedConcepts,
  freshImportedIds,
  focusedEvidenceCount,
  advancingPlan,
  markingProducedFromCue,
  showCueOverflowMenu,
  onReviewHistory,
  onDefer,
  onToggleOverflow,
  onMarkProducedFromCue,
  onAdvancePlan,
  onDismissCue,
  formatCompactViews,
}: FeedAdvanceCueProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 16,
        padding: '10px 14px',
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: LeTrendRadius.md,
        fontSize: 13,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ color: '#166534', fontWeight: 600 }}>
          {cue.kind === 'fresh_activity'
            ? `${cue.imported} nya klipp i historiken`
            : `${cue.imported} historiska klipp importerade`}
          {activeNudgesCount > 1 && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: '#166534', opacity: 0.65 }}>
              +{activeNudgesCount - 1} fler
            </span>
          )}
        </div>
        <div style={{ color: '#166534', fontSize: 11, opacity: 0.75, marginTop: 2 }}>
          {cue.kind === 'fresh_activity'
            ? (nuConcept
                ? 'Var det nu-konceptet som publicerades?'
                : (hasActivePlan
                    ? 'Kunden publicerade nytt – granska historiken och flytta planen om det stämmer.'
                    : 'Placera ett koncept i planen för att kunna flytta framåt.'))
            : (hasActivePlan
                ? 'Äldre innehåll – granska historiken innan du flyttar planen.'
                : 'Äldre innehåll importerat till historiken.')}
        </div>
        {nuConcept && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#166534', opacity: 0.8 }}>
            Nu:{' '}
            <span style={{ fontWeight: 600 }}>
              {nuConcept.content.content_overrides?.headline ?? 'Aktivt koncept'}
            </span>
          </div>
        )}
        {freshImportedConcepts.length > 0 && (() => {
          const glimpse = freshImportedConcepts.slice(0, 3);
          return (
            <>
              <div style={{ fontSize: 10, color: '#166534', opacity: 0.55, marginTop: 8, marginBottom: 3, fontWeight: 600, letterSpacing: '0.03em' }}>
                {freshImportedConcepts.length} {freshImportedConcepts.length === 1 ? 'nytt klipp' : 'nya klipp'}
                {freshImportedConcepts.length > 3 ? ` · visar ${glimpse.length}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {glimpse.map((clip) => {
                  const caption = clip.content.content_overrides?.script ?? null;
                  const date = clip.result.published_at
                    ? new Date(clip.result.published_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
                    : null;
                  return (
                    <div
                      key={clip.id}
                      style={{
                        display: 'flex',
                        gap: 5,
                        alignItems: 'flex-start',
                        flex: 1,
                        minWidth: 0,
                        background: 'rgba(255,255,255,0.55)',
                        borderRadius: LeTrendRadius.sm,
                        padding: '5px 6px',
                      }}
                    >
                      {clip.result.tiktok_thumbnail_url && (
                        <img
                          src={clip.result.tiktok_thumbnail_url}
                          alt=""
                          style={{ width: 20, height: 35, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
                        />
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {caption && (
                          <div
                            style={{
                              fontSize: 10,
                              color: '#166534',
                              opacity: 0.85,
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              lineHeight: 1.3,
                              marginBottom: 2,
                            }}
                          >
                            {caption}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: '#166534', opacity: 0.6, lineHeight: 1.3 }}>
                          {date ?? '—'}
                          {clip.result.tiktok_views && clip.result.tiktok_views > 0
                            ? ` · ${formatCompactViews(clip.result.tiktok_views)}`
                            : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={onReviewHistory}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 11,
              color: '#166534',
              opacity: 0.75,
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            {freshImportedIds.size > 0
              ? `Granska ${freshImportedIds.size} klipp i historiken`
              : 'Granska historiken'}
          </button>
          {focusedEvidenceCount > 0 && (
            <span style={{ fontSize: 10, color: '#166534', opacity: 0.5 }}>
              ↓ markerade nedan
            </span>
          )}
          <span style={{ fontSize: 10, color: '#166534', opacity: 0.35 }}>·</span>
          <button
            onClick={onDefer}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 11,
              color: '#6b7280',
              opacity: 0.75,
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            Inte nu
          </button>
        </div>
      </div>

      {nuConcept ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', position: 'relative' }}>
          <button
            onClick={onMarkProducedFromCue}
            disabled={markingProducedFromCue || advancingPlan}
            style={{
              padding: '5px 12px',
              background: '#16a34a',
              border: 'none',
              borderRadius: LeTrendRadius.md,
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              cursor: markingProducedFromCue || advancingPlan ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {markingProducedFromCue ? 'Markerar...' : 'Markera och flytta'}
          </button>
          <div style={{ fontSize: 10, color: '#166534', opacity: 0.6, textAlign: 'right', maxWidth: 220 }}>
            Kopplar senaste klippet till nu-konceptet och flyttar planen framåt.
          </div>
          {freshImportedConcepts.length > 0 && freshImportedConcepts[0].result.tiktok_url && (
            <div style={{ fontSize: 10, color: '#166534', opacity: 0.55, textAlign: 'right' }}>
              {'↑ länkar klippet'}
              {freshImportedConcepts[0].result.published_at
                ? ` · ${new Date(freshImportedConcepts[0].result.published_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`
                : ''}
            </div>
          )}
          <button
            type="button"
            onClick={onToggleOverflow}
            disabled={advancingPlan || markingProducedFromCue}
            aria-label="Fler val"
            style={{
              width: 28,
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#fff',
              border: '1px solid #9ca3af',
              borderRadius: LeTrendRadius.md,
              fontSize: 15,
              fontWeight: 700,
              color: '#4b5563',
              cursor: advancingPlan || markingProducedFromCue ? 'not-allowed' : 'pointer',
            }}
          >
            ⋯
          </button>
          {showCueOverflowMenu ? (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 6,
                minWidth: 210,
                padding: 6,
                background: '#fff',
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.md,
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                zIndex: 4,
              }}
            >
              <button
                type="button"
                onClick={onAdvancePlan}
                disabled={advancingPlan || markingProducedFromCue}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 'none',
                  background: 'transparent',
                  borderRadius: LeTrendRadius.sm,
                  fontSize: 12,
                  color: '#4b5563',
                  cursor: advancingPlan || markingProducedFromCue ? 'not-allowed' : 'pointer',
                }}
              >
                Flytta utan att koppla klipp
              </button>
            </div>
          ) : null}
        </div>
      ) : hasActivePlan ? (
        <button
          onClick={onAdvancePlan}
          disabled={advancingPlan}
          style={cue.kind === 'fresh_activity'
            ? {
                padding: '5px 12px',
                background: '#16a34a',
                border: 'none',
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                cursor: advancingPlan ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }
            : {
                padding: '5px 12px',
                background: 'none',
                border: '1px solid #9ca3af',
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                fontWeight: 400,
                color: '#4b5563',
                cursor: advancingPlan ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
        >
          {advancingPlan ? 'Flyttar...' : 'Flytta planen framåt'}
        </button>
      ) : (
        <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', paddingTop: 3 }}>
          Inget kommande i planen
        </span>
      )}

      <button
        onClick={() => onDismissCue(cueSignalId)}
        style={{
          background: 'none',
          border: 'none',
          fontSize: 16,
          cursor: 'pointer',
          color: '#6b7280',
          padding: '0 2px',
        }}
      >
        ×
      </button>
    </div>
  );
});
