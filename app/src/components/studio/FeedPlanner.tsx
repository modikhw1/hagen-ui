'use client';

import React, { useMemo, useState } from 'react';
import { getCustomerConceptPlacementLabel } from '@/lib/customer-concept-lifecycle';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { FeedSlot, FeedCustomerConcept, GridConfig, CmTag } from '@/lib/studio/feed-planner-types';
import { DEFAULT_GRID_CONFIG, getSlotType } from '@/lib/studio/feed-planner-types';

interface FeedPlannerProps {
  customerId: string;
  concepts: FeedCustomerConcept[];
  tags: CmTag[];
  onConceptClick?: (concept: FeedCustomerConcept) => void;
  onSlotUpdate?: (conceptId: string, feedOrder: number) => void;
  onAddConcept?: () => void;
  gridConfig?: GridConfig;
}

export function FeedPlanner({
  concepts,
  tags,
  onConceptClick,
  onAddConcept,
  gridConfig = DEFAULT_GRID_CONFIG,
}: FeedPlannerProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  const slots = useMemo(() => {
    const totalSlots = gridConfig.columns * gridConfig.rows;
    const builtSlots: FeedSlot[] = [];

    for (let i = 0; i < totalSlots; i++) {
      const feedOrder = i - gridConfig.currentSlotIndex;
      const concept = concepts.find(c => c.feed_order === feedOrder) || null;
      const type = getSlotType(feedOrder);

      builtSlots.push({
        slotIndex: i,
        feedOrder,
        concept,
        type,
      });
    }

    return builtSlots;
  }, [concepts, gridConfig]);

  const getSlotColor = (type: FeedSlot['type']) => {
    switch (type) {
      case 'planned':
        return LeTrendColors.info;
      case 'current':
        return LeTrendColors.success;
      case 'history':
        return LeTrendColors.textMuted;
      default:
        return LeTrendColors.surface;
    }
  };

  const getSlotBgColor = (type: FeedSlot['type']) => {
    switch (type) {
      case 'planned':
        return 'rgba(37, 99, 235, 0.08)';
      case 'current':
        return 'rgba(16, 185, 129, 0.08)';
      case 'history':
        return 'rgba(157, 142, 125, 0.08)';
      default:
        return LeTrendColors.surface;
    }
  };

  const getTagColor = (tagName: string) => {
    const tag = tags.find(t => t.name === tagName);
    return tag?.color || LeTrendColors.textMuted;
  };

  return (
    <div className="feed-planner">
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div>
          <h3 style={{
            fontSize: '16px',
            fontWeight: 600,
            color: LeTrendColors.textPrimary,
            margin: 0,
          }}>
            Feedplan
          </h3>
          <p style={{
            fontSize: '13px',
            color: LeTrendColors.textSecondary,
            margin: '4px 0 0 0',
          }}>
            Placera koncept i den ordning kunden kommer att möta dem.
          </p>
        </div>
        {onAddConcept && (
          <button
            onClick={onAddConcept}
            style={{
              background: LeTrendColors.brownLight,
              color: LeTrendColors.cream,
              padding: '8px 16px',
              borderRadius: LeTrendRadius.md,
              border: 'none',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + Lägg till koncept
          </button>
        )}
      </div>

      {/* Time indicators */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${gridConfig.columns}, 1fr)`,
        gap: '8px',
        marginBottom: '8px',
        paddingLeft: '2px',
        paddingRight: '2px',
      }}>
        {slots.map((slot) => (
          <div key={`label-${slot.slotIndex}`} style={{
            textAlign: 'center',
            fontSize: '11px',
            color: getSlotColor(slot.type),
            fontWeight: slot.type === 'current' ? 600 : 400,
          }}>
            {slot.type === 'current' ? 'NU' : slot.feedOrder > 0 ? `+${slot.feedOrder}` : slot.feedOrder < 0 ? `${slot.feedOrder}` : ''}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${gridConfig.columns}, 1fr)`,
        gap: '8px',
      }}>
        {slots.map((slot) => (
          <div
            key={slot.slotIndex}
            onClick={() => {
              setSelectedSlot(slot.slotIndex);
              if (slot.concept && onConceptClick) {
                onConceptClick(slot.concept);
              }
            }}
            style={{
              aspectRatio: '9/16',
              background: getSlotBgColor(slot.type),
              borderRadius: LeTrendRadius.lg,
              border: selectedSlot === slot.slotIndex
                ? `2px solid ${LeTrendColors.brownLight}`
                : `1px solid ${LeTrendColors.border}`,
              padding: '12px',
              cursor: slot.concept ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {slot.concept ? (
              <>
                {/* Concept content */}
                <div style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: LeTrendColors.textPrimary,
                  marginBottom: '8px',
                  lineHeight: 1.3,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {slot.concept.custom_script || 'Koncept'}
                </div>

                {/* Tags */}
                {slot.concept.tags && slot.concept.tags.length > 0 && (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px',
                    marginTop: 'auto',
                  }}>
                    {slot.concept.tags.slice(0, 2).map((tag, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: getTagColor(tag) + '20',
                          color: getTagColor(tag),
                          fontWeight: 500,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Status indicator */}
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: slot.type === 'current'
                    ? LeTrendColors.success
                    : slot.type === 'history'
                    ? LeTrendColors.textMuted
                    : LeTrendColors.info,
                }} />

                {/* TikTok stats if available */}
                {slot.concept.tiktok_views && (
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '8px',
                    fontSize: '10px',
                    color: LeTrendColors.textMuted,
                  }}>
                    {slot.concept.tiktok_views.toLocaleString()} visningar
                  </div>
                )}
              </>
            ) : (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: LeTrendColors.textPlaceholder,
                fontSize: '12px',
              }}>
                {getCustomerConceptPlacementLabel(slot.feedOrder, 'studio') ?? 'Planen'}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginTop: '16px',
        paddingTop: '12px',
        borderTop: `1px solid ${LeTrendColors.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: LeTrendColors.success,
          }} />
          <span style={{ fontSize: '12px', color: LeTrendColors.textSecondary }}>Nu i planen</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: LeTrendColors.info,
          }} />
          <span style={{ fontSize: '12px', color: LeTrendColors.textSecondary }}>Kommande i planen</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: LeTrendColors.textMuted,
          }} />
          <span style={{ fontSize: '12px', color: LeTrendColors.textSecondary }}>Tidigare i planen</span>
        </div>
      </div>
    </div>
  );
}

export default FeedPlanner;
