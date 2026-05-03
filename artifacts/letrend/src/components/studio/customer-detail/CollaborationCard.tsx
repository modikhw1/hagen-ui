'use client';

import React from 'react';
import { LeTrendColors } from '@/styles/letrend-design-system';
import type { CustomerConcept } from '@/types/studio-v2';
import { COLLABORATION_SCOPE_OPTIONS, type CollaborationScopeId } from './CollaborationModal';

const BROWN = LeTrendColors.brownDark;
const CREAM = LeTrendColors.cream;

export function isCollaborationConcept(concept: Pick<CustomerConcept, 'visual_variant'>): boolean {
  return (concept.visual_variant ?? '').toLowerCase() === 'collaboration';
}

export function getCollaborationInitials(name: string | null | undefined): string {
  return (name ?? 'LT')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function formatCollaborationDate(
  isoDate: string | null,
  dateType: 'exact' | 'projected'
): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const formatted = d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  return dateType === 'projected' ? `~${formatted}` : formatted;
}

export type CollaborationCardData = {
  id: string;
  partner_name: string | null;
  collaborator_reach: string | null;
  collaborator_avatar_url: string | null;
  scope: CollaborationScopeId[];
  price: number | null;
  confirmed: boolean;
  date: string | null;
  date_type: 'exact' | 'projected';
};

export type CollaborationCardProps = {
  data: CollaborationCardData;
  onClick?: () => void;
  onDelete?: () => void;
  draggable?: boolean;
  selected?: boolean;
};

export const CollaborationCard = React.memo(function CollaborationCard({
  data,
  onClick,
  onDelete,
  draggable = true,
  selected = false,
}: CollaborationCardProps) {
  const [hovered, setHovered] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const initials = getCollaborationInitials(data.partner_name);
  const dateLabel = formatCollaborationDate(data.date, data.date_type);
  const reach = (data.collaborator_reach ?? '').trim();
  const priceLabel = data.price != null && Number.isFinite(data.price) ? `${data.price} kr` : '—';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setMenuOpen(false);
      }}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.setData('text/concept-id', data.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{
        width: 158,
        aspectRatio: '9 / 16',
        borderRadius: 14,
        border: `1.5px solid ${selected ? LeTrendColors.success : BROWN}`,
        background: hovered ? 'rgba(74,47,24,0.02)' : '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '11px 10px 10px',
        position: 'relative',
        cursor: onClick ? 'pointer' : draggable ? 'grab' : 'default',
        transition: 'all 0.15s',
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
      data-testid={`collaboration-card-${data.id}`}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          borderRadius: 13,
          backgroundImage:
            'repeating-linear-gradient(-45deg, rgba(74,47,24,0.025) 0px, rgba(74,47,24,0.025) 1px, transparent 1px, transparent 8px)',
        }}
      />

      {onDelete ? (
        <div
          style={{
            position: 'absolute',
            top: 9,
            right: 9,
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label="Alternativ"
            style={{
              width: 18,
              height: 18,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2.5,
            }}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{ width: 3, height: 3, borderRadius: '50%', background: '#9CA3AF', display: 'block' }}
              />
            ))}
          </button>
          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 22,
                right: 0,
                background: '#fff',
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: 8,
                boxShadow: '0 6px 24px rgba(20,12,6,0.12)',
                padding: 4,
                zIndex: 5,
                minWidth: 120,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  border: 'none',
                  background: 'transparent',
                  color: LeTrendColors.error,
                  textAlign: 'left',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: 6,
                }}
              >
                Ta bort
              </button>
            </div>
          )}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, position: 'relative' }}>
        <div
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: BROWN,
            color: CREAM,
            fontSize: 8.5,
            fontWeight: 600,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            padding: '3px 7px',
            borderRadius: 5,
          }}
        >
          <span>✦</span> Samarbete
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {data.collaborator_avatar_url ? (
            <img
              src={data.collaborator_avatar_url}
              alt={data.partner_name ?? 'Profil'}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
                border: '1.5px solid rgba(74,47,24,0.15)',
              }}
            />
          ) : (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #c4813a, #7a3f18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: CREAM,
                flexShrink: 0,
                border: '1.5px solid rgba(74,47,24,0.15)',
              }}
            >
              {initials}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: BROWN,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {data.partner_name || 'Namn saknas'}
            </div>
            <div style={{ fontSize: 9, color: LeTrendColors.textMuted, lineHeight: 1 }}>
              {reach ? `${reach} följare` : 'följare okänt'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {data.scope.length === 0 ? (
            <div style={{ fontSize: 9.5, color: LeTrendColors.textMuted, fontStyle: 'italic' }}>
              Scope saknas
            </div>
          ) : (
            COLLABORATION_SCOPE_OPTIONS.filter((o) => data.scope.includes(o.id)).map((o) => (
              <div
                key={o.id}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: '#6B7280' }}
              >
                <div
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 3,
                    border: `1.5px solid ${BROWN}`,
                    background: BROWN,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <svg width="7" height="5" viewBox="0 0 7 5">
                    <polyline
                      points="1,2.5 2.8,4.2 6,1"
                      stroke={CREAM}
                      strokeWidth="1.4"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                {o.label}
              </div>
            ))
          )}
        </div>

        <div style={{ height: 1, background: 'rgba(74,47,24,0.08)', margin: '1px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              fontSize: data.confirmed ? 11.5 : 10.5,
              fontWeight: 500,
              color: data.confirmed ? BROWN : LeTrendColors.textMuted,
              fontStyle: data.confirmed ? 'normal' : 'italic',
            }}
          >
            {dateLabel}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: data.price != null ? BROWN : LeTrendColors.textMuted }}>
            {priceLabel}
          </div>
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            borderRadius: 4,
            padding: '2px 5px',
            background: data.confirmed ? 'rgba(16,185,129,0.1)' : 'rgba(74,47,24,0.07)',
            fontSize: 8.5,
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: data.confirmed ? '#0a6644' : LeTrendColors.textMuted,
            alignSelf: 'flex-start',
          }}
        >
          <div
            style={{
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: data.confirmed ? '#10B981' : '#C4B5A0',
            }}
          />
          {data.confirmed ? 'Bekräftat' : 'Ej bekräftat'}
        </div>
      </div>
    </div>
  );
});
