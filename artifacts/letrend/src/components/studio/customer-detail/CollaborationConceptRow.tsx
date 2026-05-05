'use client';

import React from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CustomerConcept } from '@/types/studio-v2';
import { COLLABORATION_SCOPE_OPTIONS, type CollaborationScopeId } from './CollaborationModal';
import { getCollaborationInitials, formatCollaborationDate } from './CollaborationCard';

const BROWN = '#4A2F18';
const CREAM = '#FAF8F5';

export interface CollaborationConceptRowProps {
  concept: CustomerConcept;
  onEdit: () => void;
  onDelete: (conceptId: string) => Promise<void>;
}

export function CollaborationConceptRow({
  concept,
  onEdit,
  onDelete,
}: CollaborationConceptRowProps) {
  const [hovered, setHovered] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const initials = getCollaborationInitials(concept.partner_name);
  const dateLabel = formatCollaborationDate(
    concept.result?.planned_publish_at ?? null,
    concept.collaboration_date_type ?? 'exact'
  );
  const scopeIds = (concept.scope ?? []).filter((s): s is CollaborationScopeId =>
    s === 'medverka' || s === 'skriva' || s === 'producera' || s === 'skriva_medverka'
  );

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(concept.id);
    } finally {
      setDeleting(false);
    }
  };

  const avatarUrl = concept.collaborator_avatar_url;

  return (
    <article
      onClick={onEdit}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        cursor: 'pointer',
        borderRadius: LeTrendRadius.lg,
        border: `1.5px solid ${BROWN}`,
        background: hovered ? 'rgba(74,47,24,0.02)' : LeTrendColors.surface,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 10,
        overflow: 'hidden',
        minHeight: 160,
        transition: 'background 0.12s',
      }}
    >
      {/* Diagonal stripe pattern */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(-45deg, rgba(74,47,24,0.025) 0px, rgba(74,47,24,0.025) 1px, transparent 1px, transparent 8px)',
      }} />

      {/* Top section: badge + avatar + name/reach */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
        {/* ✦ Samarbete badge */}
        <div style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4, background: BROWN, color: CREAM, fontSize: 8.5, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 5 }}>
          <span>✦</span> Samarbete
        </div>

        {/* Avatar + name + reach */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={concept.partner_name ?? ''}
              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(74,47,24,0.15)', flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #c4813a, #7a3f18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: CREAM, flexShrink: 0, border: '1.5px solid rgba(74,47,24,0.15)' }}>
              {initials}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: BROWN, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {concept.partner_name || 'Namn saknas'}
            </div>
            {concept.collaborator_reach ? (
              <div style={{ fontSize: 11, color: LeTrendColors.textMuted, lineHeight: 1.2 }}>
                {concept.collaborator_reach} följare
              </div>
            ) : null}
          </div>
        </div>

        {/* Scope chips */}
        {scopeIds.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {COLLABORATION_SCOPE_OPTIONS.filter((o) => scopeIds.includes(o.id)).map((o) => (
              <span key={o.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, background: 'rgba(74,47,24,0.07)', border: '1px solid rgba(74,47,24,0.14)', fontSize: 10, fontWeight: 600, color: BROWN }}>
                {o.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom section: divider + date/price + confirmation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, position: 'relative' }}>
        <div style={{ height: 1, background: 'rgba(74,47,24,0.08)' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          {dateLabel !== '—' ? (
            <span style={{ fontSize: 11, color: LeTrendColors.textMuted }}>{dateLabel}</span>
          ) : (
            <span style={{ fontSize: 11, color: LeTrendColors.textMuted, fontStyle: 'italic' }}>Inget datum satt</span>
          )}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {concept.price != null ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: BROWN }}>{concept.price} kr</span>
            ) : null}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, borderRadius: 4, padding: '2px 6px', background: concept.confirmed ? 'rgba(16,185,129,0.1)' : 'rgba(74,47,24,0.07)', fontSize: 10.5, fontWeight: 600, color: concept.confirmed ? '#0a6644' : LeTrendColors.textMuted }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: concept.confirmed ? '#10B981' : '#C4B5A0' }} />
              {concept.confirmed ? 'Bekräftat' : 'Ej bekräftat'}
            </div>
          </div>
        </div>
      </div>

      {/* Hover × delete */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label="Ta bort samarbete"
        title="Ta bort samarbete"
        style={{
          position: 'absolute',
          top: 7,
          right: 7,
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: '1px solid #e5e7eb',
          background: hovered ? '#fff' : 'transparent',
          cursor: deleting ? 'not-allowed' : 'pointer',
          fontSize: 14,
          color: '#9ca3af',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s, background 0.15s',
          lineHeight: 1,
          padding: 0,
          zIndex: 1,
        }}
      >
        ×
      </button>
    </article>
  );
}
