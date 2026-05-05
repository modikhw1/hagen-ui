'use client';

import React from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CustomerConcept } from '@/types/studio-v2';
import { COLLABORATION_SCOPE_OPTIONS, type CollaborationScopeId } from './CollaborationModal';
import { getCollaborationInitials, formatCollaborationDate } from './CollaborationCard';

const BROWN = LeTrendColors.brownDark;

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
  const scopeLabel =
    COLLABORATION_SCOPE_OPTIONS.filter((o) => scopeIds.includes(o.id))
      .map((o) => o.label)
      .join(', ') || 'Scope saknas';

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    await onDelete(concept.id);
    setDeleting(false);
  };

  return (
    <article
      onClick={onEdit}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(74,47,24,0.02)' : LeTrendColors.surface,
        borderRadius: LeTrendRadius.lg,
        padding: '12px 14px',
        border: `1.5px solid ${BROWN}`,
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
    >
      {/* Left: badge + avatar */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          width: 60,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            background: BROWN,
            color: LeTrendColors.cream,
            fontSize: 7.5,
            fontWeight: 700,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            padding: '3px 6px',
            borderRadius: 5,
            whiteSpace: 'nowrap',
          }}
        >
          <span>✦</span> Samarbete
        </div>
        {concept.collaborator_avatar_url ? (
          <img
            src={concept.collaborator_avatar_url}
            alt={concept.partner_name ?? ''}
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1.5px solid rgba(74,47,24,0.15)',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #c4813a, #7a3f18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: LeTrendColors.cream,
              flexShrink: 0,
              border: '1.5px solid rgba(74,47,24,0.15)',
            }}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BROWN, marginBottom: 3, lineHeight: 1.3 }}>
          {concept.partner_name || 'Namn saknas'}
          {concept.collaborator_reach ? (
            <span style={{ fontSize: 12, fontWeight: 400, color: LeTrendColors.textMuted, marginLeft: 6 }}>
              {concept.collaborator_reach} följare
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 12, color: LeTrendColors.textSecondary, marginBottom: 5 }}>
          {scopeLabel}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {dateLabel !== '—' ? (
            <span style={{ fontSize: 11, color: LeTrendColors.textMuted }}>{dateLabel}</span>
          ) : null}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              borderRadius: 999,
              padding: '2px 8px',
              background: concept.confirmed ? 'rgba(16,185,129,0.1)' : 'rgba(74,47,24,0.07)',
              fontSize: 11,
              fontWeight: 600,
              color: concept.confirmed ? '#0a6644' : LeTrendColors.textMuted,
            }}
          >
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: concept.confirmed ? '#10B981' : '#C4B5A0',
              }}
            />
            {concept.confirmed ? 'Bekräftat' : 'Ej bekräftat'}
          </div>
          {concept.price != null ? (
            <span style={{ fontSize: 11, fontWeight: 600, color: BROWN }}>{concept.price} kr</span>
          ) : null}
        </div>
      </div>

      {/* Edit button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        style={{
          padding: '6px 12px',
          background: '#fff',
          border: `1px solid ${LeTrendColors.brownLight}`,
          borderRadius: LeTrendRadius.md,
          fontSize: 12,
          fontWeight: 600,
          color: BROWN,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Redigera
      </button>

      {/* Delete × */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label="Ta bort från plan"
        title="Ta bort från plan"
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
        }}
      >
        ×
      </button>
    </article>
  );
}
