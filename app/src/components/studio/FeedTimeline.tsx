'use client';

import React, { useMemo } from 'react';
import { getCustomerConceptPlacementLabel } from '@/lib/customer-concept-lifecycle';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CmTag } from '@/lib/studio/feed-planner-types';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

// Minimal interface — compatible with both TimelineConcept and CustomerConcept
export interface TimelineConcept {
  id: string;
  feed_order: number | null;
  custom_script?: string | null;
  why_it_fits?: string | null;
  cm_note?: string | null;
  tags?: string[];
  tiktok_thumbnail_url?: string | null;
  tiktok_views?: number | null;
  tiktok_likes?: number | null;
  published_at?: string | null;
}

interface FeedTimelineProps {
  concepts: TimelineConcept[];
  tags?: CmTag[];
  /** Called when user clicks a card with a concept */
  onConceptClick?: (concept: TimelineConcept) => void;
  /** Called when user wants to add another future slot */
  onAddFuture?: () => void;
  /** Called when user wants to import more TikTok history */
  onAddHistory?: () => void;
  readOnly?: boolean;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const CARD_W = 110;
const CARD_H = 196; // ~9:16

// Slot numbers are displayed as 5 - feed_order:
//   feed_order +4 → #1  (furthest future)
//   feed_order  0 → #5  (ready to produce)
//   feed_order -4 → #9  (oldest history)
const toSlotNumber = (feedOrder: number) => 5 - feedOrder;

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

// ─────────────────────────────────────────────
// Zone helpers
// ─────────────────────────────────────────────

function zoneAccent(feedOrder: number): string {
  if (feedOrder < 0) return LeTrendColors.textMuted;
  if (feedOrder === 0) return LeTrendColors.success;
  return LeTrendColors.info;
}

function zoneBg(feedOrder: number): string {
  if (feedOrder < 0) return 'rgba(157,142,125,0.06)';
  if (feedOrder === 0) return 'rgba(90,143,90,0.10)';
  return 'rgba(37,99,235,0.06)';
}

function zoneBorder(feedOrder: number): string {
  if (feedOrder === 0) return `2px solid ${LeTrendColors.success}`;
  return `1px solid ${LeTrendColors.border}`;
}

function zoneLabel(feedOrder: number): string {
  return getCustomerConceptPlacementLabel(feedOrder, 'studio') ?? 'Planen';
}

// ─────────────────────────────────────────────
// ExpandButton
// ─────────────────────────────────────────────

function ExpandButton({ onClick, title, side }: { onClick: () => void; title: string; side: 'left' | 'right' }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        flexShrink: 0,
        width: 28,
        height: CARD_H,
        borderRadius: LeTrendRadius.lg,
        border: `1px dashed ${LeTrendColors.borderMedium}`,
        background: 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: LeTrendColors.textMuted,
        fontSize: 16,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = LeTrendColors.surface)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

export function FeedTimeline({
  concepts,
  tags = [],
  onConceptClick,
  onAddFuture,
  onAddHistory,
  readOnly = false,
}: FeedTimelineProps) {
  const orders = concepts.map(c => c.feed_order ?? 0);

  // Always show at least 4 slots in each direction
  const maxFuture = Math.max(4, ...orders.filter(o => o > 0), 0);
  const maxHistory = Math.max(4, ...orders.filter(o => o < 0).map(o => -o), 0);

  // Build slot array: descending feed_order = left-to-right (future → history)
  const slots = useMemo(() => {
    const byOrder = new Map(concepts.map(c => [c.feed_order ?? 0, c]));
    const result: Array<{ feedOrder: number; concept: TimelineConcept | null }> = [];
    for (let o = maxFuture; o >= -maxHistory; o--) {
      result.push({ feedOrder: o, concept: byOrder.get(o) ?? null });
    }
    return result;
  }, [concepts, maxFuture, maxHistory]);

  const getTagColor = (name: string) =>
    tags.find(t => t.name === name)?.color ?? LeTrendColors.textMuted;

  const hasThumbnail = (c: TimelineConcept | null, feedOrder: number) =>
    feedOrder < 0 && !!c?.tiktok_thumbnail_url;

  return (
    <div>
      {/* Zone header row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 10,
        paddingInline: 2,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: LeTrendColors.info, letterSpacing: '0.06em' }}>
          KOMMANDE
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: LeTrendColors.success }}>
          NU
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: LeTrendColors.textMuted, letterSpacing: '0.06em' }}>
          HISTORIK
        </span>
      </div>

      {/* Scrollable card strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 10,
          scrollbarWidth: 'thin',
          scrollbarColor: `${LeTrendColors.borderMedium} transparent`,
        }}
      >
        {/* Expand future (left edge) */}
        {!readOnly && onAddFuture && (
          <ExpandButton onClick={onAddFuture} title="Lägg till kommande slot" side="left" />
        )}

        {slots.map(({ feedOrder, concept }) => {
          const thumb = hasThumbnail(concept, feedOrder);

          return (
            <div
              key={feedOrder}
              onClick={() => concept && onConceptClick?.(concept)}
              style={{
                flexShrink: 0,
                width: CARD_W,
                height: CARD_H,
                borderRadius: LeTrendRadius.lg,
                border: zoneBorder(feedOrder),
                background: thumb
                  ? `url(${concept!.tiktok_thumbnail_url}) center/cover no-repeat`
                  : zoneBg(feedOrder),
                cursor: concept ? 'pointer' : 'default',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                transition: 'box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                if (concept) e.currentTarget.style.boxShadow = '0 4px 16px rgba(74,47,24,0.14)';
              }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
            >
              {/* Slot number badge */}
              <div style={{
                position: 'absolute',
                top: 6,
                left: 7,
                fontSize: 10,
                fontWeight: 700,
                color: thumb ? 'rgba(255,255,255,0.92)' : zoneAccent(feedOrder),
                textShadow: thumb ? '0 1px 4px rgba(0,0,0,0.8)' : 'none',
                lineHeight: 1,
              }}>
                #{toSlotNumber(feedOrder)}
              </div>

              {/* Zone dot */}
              <div style={{
                position: 'absolute',
                top: 7,
                right: 7,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: zoneAccent(feedOrder),
                boxShadow: thumb ? '0 0 0 1.5px rgba(0,0,0,0.35)' : 'none',
              }} />

              {concept ? (
                <>
                  {/* Text content (non-thumbnail cards) */}
                  {!thumb && (
                    <>
                      <div style={{
                        padding: '26px 8px 4px',
                        fontSize: 11,
                        fontWeight: 500,
                        color: LeTrendColors.textPrimary,
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {concept.custom_script || concept.why_it_fits || concept.cm_note || 'Koncept'}
                      </div>

                      {(concept.tags?.length ?? 0) > 0 && (
                        <div style={{
                          padding: '0 7px',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 3,
                          marginTop: 5,
                        }}>
                          {concept.tags!.slice(0, 2).map((tag, i) => (
                            <span key={i} style={{
                              fontSize: 9,
                              padding: '1px 5px',
                              borderRadius: 3,
                              background: getTagColor(tag) + '22',
                              color: getTagColor(tag),
                              fontWeight: 600,
                            }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* TikTok stats overlay (thumbnail cards) */}
                  {thumb && (concept.tiktok_views != null || concept.tiktok_likes != null) && (
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'linear-gradient(transparent, rgba(0,0,0,0.72))',
                      padding: '20px 8px 6px',
                      display: 'flex',
                      gap: 8,
                    }}>
                      {concept.tiktok_views != null && (
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.92)', fontWeight: 600 }}>
                          ▶ {formatCount(concept.tiktok_views)}
                        </span>
                      )}
                      {concept.tiktok_likes != null && (
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)' }}>
                          ♥ {formatCount(concept.tiktok_likes)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Published date (non-thumbnail history) */}
                  {feedOrder < 0 && !thumb && concept.published_at && (
                    <div style={{
                      position: 'absolute',
                      bottom: 6,
                      left: 8,
                      fontSize: 9,
                      color: LeTrendColors.textMuted,
                    }}>
                      {new Date(concept.published_at).toLocaleDateString('sv-SE', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  )}
                </>
              ) : (
                /* Empty slot placeholder */
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '8px 10px',
                  paddingTop: 20,
                  fontSize: 10,
                  color: LeTrendColors.textPlaceholder,
                  lineHeight: 1.4,
                }}>
                  {zoneLabel(feedOrder)}
                </div>
              )}
            </div>
          );
        })}

        {/* Expand history (right edge) */}
        {!readOnly && onAddHistory && (
          <ExpandButton onClick={onAddHistory} title="Importera mer historik" side="right" />
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 2 }}>
        {[
          { color: LeTrendColors.info, label: 'Kommande i planen' },
          { color: LeTrendColors.success, label: 'Nu i planen' },
          { color: LeTrendColors.textMuted, label: 'Tidigare i planen' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 11, color: LeTrendColors.textSecondary }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FeedTimeline;
