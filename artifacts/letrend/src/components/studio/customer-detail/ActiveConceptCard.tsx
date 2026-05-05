'use client';

import React from 'react';
import { toast } from 'sonner';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import { StatusChip } from '@/components/studio-v2/StatusChip';
import { getNextCustomerConceptAssignmentStatus } from '@/lib/customer-concept-lifecycle';
import { resolveConceptContent } from '@/lib/studio-v2-concept-content';
import type { CmTag, CustomerConcept, ConceptContentOverrides } from '@/types/studio-v2';
import type { CustomerConceptAssignmentStatus } from '@/types/customer-lifecycle';
import type { TranslatedConcept } from '@/lib/translator';
import type { CMIdentity } from './feedTypes';
import { getWorkspaceConceptDetails, getWorkspaceConceptTitle } from './shared';

export interface ActiveConceptCardProps {
  concept: CustomerConcept;
  justAdded: boolean;
  formatDate: (dateStr: string | null) => string;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  onDelete: (conceptId: string) => Promise<void>;
  onChangeStatus: (conceptId: string, newStatus: CustomerConceptAssignmentStatus) => Promise<void>;
  onUpdateCmNote: (conceptId: string, note: string) => Promise<void>;
  onUpdateWhyItFits: (conceptId: string, text: string) => Promise<void>;
  onPatchConcept?: (conceptId: string, updates: Partial<CustomerConcept>) => Promise<void>;
  onNavigateToFeedSlot?: (feedOrder: number) => void;
  onBeginFeedPlacement?: (conceptId: string) => void;
  cmDisplayNames: Record<string, CMIdentity>;
  cmTags: CmTag[];
  tags: string[];
  onUpdateTags?: (conceptId: string, newTags: string[]) => Promise<void>;
  libraryAssignmentCounts?: Record<string, number>;
  libraryAssignmentCmIds?: Record<string, string[]>;
  postingWeekdays?: number[] | null;
}

interface CustomizeModalProps {
  concept: CustomerConcept;
  resolvedScript: string;
  resolvedHeadline: string;
  resolvedInstructions: string;
  resolvedWhyItFits: string;
  onClose: () => void;
  onUpdateCmNote: (id: string, note: string) => Promise<void>;
  onUpdateWhyItFits: (id: string, text: string) => Promise<void>;
  onPatchConcept?: (id: string, updates: Partial<CustomerConcept>) => Promise<void>;
}

function CustomizeModal({
  concept,
  resolvedScript,
  resolvedHeadline,
  resolvedInstructions,
  resolvedWhyItFits,
  onClose,
  onUpdateCmNote,
  onUpdateWhyItFits,
  onPatchConcept,
}: CustomizeModalProps) {
  const [headline, setHeadline] = React.useState(
    (concept.content.content_overrides?.headline as string | undefined) ?? resolvedHeadline,
  );
  const [whyItFits, setWhyItFits] = React.useState(concept.content.why_it_fits || resolvedWhyItFits);
  const [instructions, setInstructions] = React.useState(
    (concept.content.content_overrides?.filming_instructions as string | undefined) ??
      concept.content.filming_instructions ??
      resolvedInstructions,
  );
  const [cmNote, setCmNote] = React.useState(concept.markers.assignment_note ?? concept.cm_note ?? '');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setHeadline(
      (concept.content.content_overrides?.headline as string | undefined) ?? resolvedHeadline,
    );
    setWhyItFits(concept.content.why_it_fits || resolvedWhyItFits);
    setInstructions(
      (concept.content.content_overrides?.filming_instructions as string | undefined) ??
        concept.content.filming_instructions ??
        resolvedInstructions,
    );
    setCmNote(concept.markers.assignment_note ?? concept.cm_note ?? '');
  }, [concept.id]);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [showScript, setShowScript] = React.useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await Promise.all([
        onUpdateCmNote(concept.id, cmNote),
        onUpdateWhyItFits(concept.id, whyItFits),
        ...(onPatchConcept
          ? [
              onPatchConcept(concept.id, {
                content_overrides: {
                  ...(concept.content.content_overrides ?? {}),
                  headline: headline || undefined,
                  filming_instructions: instructions || undefined,
                } as ConceptContentOverrides,
              } as Partial<CustomerConcept>),
            ]
          : []),
      ]);
      toast.success('Sparat');
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Något gick fel. Försök igen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 95,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(26,22,18,0.32)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`@keyframes letrend-spin{to{transform:rotate(360deg)}}`}</style>
      <div
        style={{
          width: 'min(580px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
          background: '#fff',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 20px 60px rgba(26,22,18,0.18)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: LeTrendColors.brownDark }}>
            Anpassa för kund
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              cursor: 'pointer',
              color: LeTrendColors.textSecondary,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {resolvedScript ? (
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setShowScript((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 12,
                fontWeight: 600,
                color: LeTrendColors.brownLight,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>{showScript ? '▼' : '▶'}</span> Visa manus (referens)
            </button>
            {showScript && (
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  background: '#faf8f5',
                  borderRadius: LeTrendRadius.md,
                  border: `1px solid ${LeTrendColors.border}`,
                  fontSize: 13,
                  color: LeTrendColors.textSecondary,
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                }}
              >
                {resolvedScript}
              </div>
            )}
          </div>
        ) : null}

        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: LeTrendColors.textSecondary,
              marginBottom: 4,
            }}
          >
            Rubrik / titel
          </label>
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Konceptets rubrik för den här kunden"
            style={{
              width: '100%',
              padding: '9px 12px',
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              fontSize: 14,
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: LeTrendColors.textSecondary,
              marginBottom: 4,
            }}
          >
            Varför det passar kunden
            <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 6, color: LeTrendColors.textMuted }}>
              Syns hos kunden
            </span>
          </label>
          <textarea
            value={whyItFits}
            onChange={(e) => setWhyItFits(e.target.value)}
            rows={3}
            placeholder="Varför passar det här konceptet just den här kunden?"
            style={{
              width: '100%',
              padding: '9px 12px',
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              fontSize: 13,
              resize: 'vertical',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: LeTrendColors.textSecondary,
              marginBottom: 4,
            }}
          >
            Instruktioner
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            placeholder="Specifika instruktioner för det här uppdraget"
            style={{
              width: '100%',
              padding: '9px 12px',
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              fontSize: 13,
              resize: 'vertical',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: LeTrendColors.textSecondary,
              marginBottom: 4,
            }}
          >
            CM-notering
            <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 6, color: LeTrendColors.textMuted }}>
              Intern, syns ej hos kunden
            </span>
          </label>
          <textarea
            value={cmNote}
            onChange={(e) => setCmNote(e.target.value)}
            rows={2}
            placeholder="Timing, kontext eller nästa steg?"
            style={{
              width: '100%',
              padding: '9px 12px',
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              fontSize: 13,
              resize: 'vertical',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        {saveError && (
          <div
            style={{
              marginBottom: 12,
              padding: '8px 12px',
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: LeTrendRadius.md,
              fontSize: 13,
              color: '#b91c1c',
            }}
          >
            {saveError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '9px 16px',
              background: '#fff',
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              fontSize: 13,
              fontWeight: 600,
              color: LeTrendColors.textSecondary,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            style={{
              padding: '9px 16px',
              background: LeTrendColors.brownDark,
              border: 'none',
              borderRadius: LeTrendRadius.md,
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {saving && (
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: '#fff',
                  display: 'inline-block',
                  animation: 'letrend-spin 0.7s linear infinite',
                }}
              />
            )}
            {saving ? 'Sparar…' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  );
}

const THUMB_W = 72;
const THUMB_H = Math.round(THUMB_W * 16 / 9);

const WEEKDAY_NAMES_SV = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];

function weekdayEstimateLabel(weekdays: number[]): string {
  if (weekdays.length === 0) return '';
  const sorted = [...weekdays].sort((a, b) => a - b);
  return 'vanligtvis ' + sorted.map((d) => WEEKDAY_NAMES_SV[d] ?? '').filter(Boolean).join('/');
}

export function ActiveConceptCard({
  concept,
  justAdded,
  formatDate,
  getConceptDetails,
  onDelete,
  onChangeStatus,
  onUpdateCmNote,
  onUpdateWhyItFits,
  onPatchConcept,
  onNavigateToFeedSlot,
  onBeginFeedPlacement,
  cmDisplayNames,
  cmTags,
  tags,
  onUpdateTags,
  libraryAssignmentCounts,
  libraryAssignmentCmIds,
  postingWeekdays,
}: ActiveConceptCardProps) {
  const details = getWorkspaceConceptDetails(concept, getConceptDetails);
  const resolved = resolveConceptContent(concept, details ?? null);
  const nextStatus = getNextCustomerConceptAssignmentStatus(concept.assignment.status);
  const [showCustomize, setShowCustomize] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [savingTags, setSavingTags] = React.useState(false);
  const [showPicker, setShowPicker] = React.useState(false);
  const pickerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const tagColorMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const t of cmTags) map.set(t.name, t.color);
    return map;
  }, [cmTags]);

  const availableTagsToAdd = React.useMemo(
    () => cmTags.filter((t) => !tags.includes(t.name)),
    [cmTags, tags],
  );

  const addTag = async (name: string) => {
    if (tags.includes(name) || !onUpdateTags) return;
    setSavingTags(true);
    await onUpdateTags(concept.id, [...tags, name]);
    setSavingTags(false);
    setShowPicker(false);
  };

  const removeTag = async (tag: string) => {
    if (!onUpdateTags) return;
    setSavingTags(true);
    await onUpdateTags(concept.id, tags.filter((t) => t !== tag));
    setSavingTags(false);
  };

  const title = getWorkspaceConceptTitle(concept, details ?? null);
  const initials = title.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';
  const thumbnailUrl = concept.result.tiktok_thumbnail_url
    ?? (details as { thumbnail_url?: string | null; preview_image_url?: string | null } | undefined)?.thumbnail_url
    ?? (details as { thumbnail_url?: string | null; preview_image_url?: string | null } | undefined)?.preview_image_url
    ?? null;
  const tiktokUrl = concept.result.tiktok_url;
  const addedDate = concept.assignment.added_at ?? concept.added_at;
  const plannedPublishAt = concept.result.planned_publish_at;
  const cmUsageCount =
    concept.concept_id && libraryAssignmentCounts ? (libraryAssignmentCounts[concept.concept_id] ?? 0) : 0;
  const cmUsageNames = React.useMemo(() => {
    if (!concept.concept_id || !libraryAssignmentCmIds) return [];
    const ids = libraryAssignmentCmIds[concept.concept_id] ?? [];
    return ids.map((id) => cmDisplayNames[id]?.name ?? id);
  }, [concept.concept_id, libraryAssignmentCmIds, cmDisplayNames]);
  const [showCmTooltip, setShowCmTooltip] = React.useState(false);
  const canBeginFeedPlacement =
    concept.assignment.status === 'draft' && concept.placement.feed_order === null;

  const thumbnailNode = thumbnailUrl ? (
    tiktokUrl ? (
      <a href={tiktokUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', flexShrink: 0 }}>
        <img
          src={thumbnailUrl}
          alt={title}
          style={{
            width: THUMB_W,
            height: THUMB_H,
            objectFit: 'cover',
            borderRadius: 8,
            display: 'block',
            boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
          }}
        />
      </a>
    ) : (
      <img
        src={thumbnailUrl}
        alt={title}
        style={{
          width: THUMB_W,
          height: THUMB_H,
          objectFit: 'cover',
          borderRadius: 8,
          display: 'block',
          boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
          flexShrink: 0,
        }}
      />
    )
  ) : (
    <div
      style={{
        width: THUMB_W,
        height: THUMB_H,
        borderRadius: 8,
        background: '#f0ece4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        fontWeight: 800,
        color: LeTrendColors.brownLight,
        letterSpacing: '-0.02em',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );

  return (
    <>
      <article
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: justAdded ? '#fffaf1' : LeTrendColors.surface,
          borderRadius: LeTrendRadius.lg,
          padding: 14,
          border: `1px solid ${justAdded ? '#d6b284' : LeTrendColors.border}`,
          boxShadow: justAdded ? '0 0 0 1px rgba(74,47,24,0.05)' : 'none',
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
          position: 'relative',
        }}
      >
        {/* Delete × button — top-right, visible on hover */}
        <button
          type="button"
          onClick={() => void onDelete(concept.id)}
          aria-label="Ta bort från plan"
          title="Ta bort från plan"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: '1px solid #e5e7eb',
            background: hovered ? '#fff' : 'transparent',
            cursor: 'pointer',
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
        {thumbnailNode}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
            <h3
              style={{
                flex: 1,
                fontSize: 15,
                fontWeight: 700,
                color: LeTrendColors.brownDark,
                margin: 0,
                lineHeight: 1.35,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {title}
            </h3>
            <StatusChip
              status={concept.assignment.status}
              onClick={() => {
                if (!nextStatus) return;
                void onChangeStatus(concept.id, nextStatus);
              }}
              editable={Boolean(nextStatus)}
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            {addedDate ? (
              <span style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
                Inlagd {formatDate(addedDate)}
              </span>
            ) : null}
            {plannedPublishAt ? (
              <span style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
                · Uppladdning {formatDate(plannedPublishAt)}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
                · Preliminär uppladdning
                {postingWeekdays && postingWeekdays.length > 0
                  ? ` · ${weekdayEstimateLabel(postingWeekdays)}`
                  : ''}
              </span>
            )}
            {null /* position label shown in outer SortableConceptRow */}
            {cmUsageCount > 1 ? (
              <span
                style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
                onMouseEnter={() => setShowCmTooltip(true)}
                onMouseLeave={() => setShowCmTooltip(false)}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: cmUsageCount >= 4 ? '#92400e' : LeTrendColors.textSecondary,
                    background: cmUsageCount >= 4 ? '#fef3c7' : '#f3f4f6',
                    border: `1px solid ${cmUsageCount >= 4 ? '#f59e0b' : '#e5e7eb'}`,
                    borderRadius: 999,
                    padding: '1px 7px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    cursor: cmUsageNames.length > 0 ? 'default' : undefined,
                  }}
                >
                  Använt av {cmUsageCount} CMs
                </span>
                {showCmTooltip && cmUsageNames.length > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 6px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#1a1612',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 500,
                      borderRadius: 6,
                      padding: '5px 9px',
                      whiteSpace: 'nowrap',
                      zIndex: 20,
                      pointerEvents: 'none',
                      lineHeight: 1.5,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    }}
                  >
                    {cmUsageNames.join(', ')}
                    <span
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 0,
                        height: 0,
                        borderLeft: '5px solid transparent',
                        borderRight: '5px solid transparent',
                        borderTop: '5px solid #1a1612',
                      }}
                    />
                  </span>
                )}
              </span>
            ) : null}
          </div>

          {tags.length > 0 || onUpdateTags ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {tags.map((tag) => {
                const color = tagColorMap.get(tag);
                return (
                  <span
                    key={tag}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#374151',
                      background: color ? `${color}18` : '#f3f4f6',
                      border: `1px solid ${color ?? '#e5e7eb'}`,
                      borderRadius: 999,
                      padding: '2px 8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {color && (
                      <span
                        style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }}
                      />
                    )}
                    {tag}
                    {onUpdateTags && (
                      <button
                        type="button"
                        onClick={() => void removeTag(tag)}
                        disabled={savingTags}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          color: '#9ca3af',
                          fontSize: 11,
                          lineHeight: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                );
              })}
              {onUpdateTags && (
                <div style={{ position: 'relative' }} ref={pickerRef}>
                  <button
                    type="button"
                    onClick={() => setShowPicker((v) => !v)}
                    disabled={savingTags}
                    style={{
                      fontSize: 11,
                      color: '#9ca3af',
                      background: 'none',
                      border: '1px dashed #d1d5db',
                      borderRadius: 999,
                      padding: '2px 8px',
                      cursor: 'pointer',
                      lineHeight: 1.4,
                    }}
                  >
                    + Tagg
                  </button>
                  {showPicker && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        zIndex: 50,
                        background: '#fff',
                        borderRadius: 8,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                        border: '1px solid #e5e7eb',
                        minWidth: 160,
                        padding: 6,
                      }}
                    >
                      {cmTags.length === 0 ? (
                        <div style={{ padding: '6px 8px', fontSize: 11, color: '#9ca3af' }}>
                          Inga taggar ännu. Klicka "Hantera taggar".
                        </div>
                      ) : availableTagsToAdd.length === 0 ? (
                        <div style={{ padding: '6px 8px', fontSize: 11, color: '#9ca3af' }}>
                          Alla taggar är tillagda
                        </div>
                      ) : (
                        availableTagsToAdd.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => void addTag(t.name)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              width: '100%',
                              padding: '5px 8px',
                              background: 'none',
                              border: 'none',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 12,
                              textAlign: 'left',
                              color: '#374151',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.background = '#f9fafb';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.background = 'none';
                            }}
                          >
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                background: t.color,
                                flexShrink: 0,
                              }}
                            />
                            {t.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setShowCustomize(true)}
              style={{
                padding: '6px 12px',
                background: '#fff',
                border: `1px solid ${LeTrendColors.brownLight}`,
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                fontWeight: 600,
                color: LeTrendColors.brownDark,
                cursor: 'pointer',
              }}
            >
              Anpassa för kund
            </button>
            {canBeginFeedPlacement && onBeginFeedPlacement ? (
              <button
                type="button"
                onClick={() => onBeginFeedPlacement(concept.id)}
                style={{
                  padding: '6px 12px',
                  background: '#0f766e',
                  border: 'none',
                  color: '#fff',
                  borderRadius: LeTrendRadius.md,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Placera i feed
              </button>
            ) : null}
            {null /* "Delad med kund" button removed — customer sharing is handled via the email flow (KommunikationSection) and automatically on production publish */}
          </div>
        </div>
      </article>

      {showCustomize && (
        <CustomizeModal
          concept={concept}
          resolvedScript={resolved.script.script_sv ?? ''}
          resolvedHeadline={resolved.headline.headline_sv}
          resolvedInstructions={resolved.instructions.filming_instructions}
          resolvedWhyItFits={resolved.fit.whyItWorks_sv}
          onClose={() => setShowCustomize(false)}
          onUpdateCmNote={onUpdateCmNote}
          onUpdateWhyItFits={onUpdateWhyItFits}
          onPatchConcept={onPatchConcept}
        />
      )}
    </>
  );
}
