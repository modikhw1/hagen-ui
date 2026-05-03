'use client';

import React from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import { getStudioCustomerConceptDisplayTitle } from '@/lib/studio/customer-concepts';
import { getStudioFeedOrderLabel } from '@/lib/customer-concept-lifecycle';
import type { FeedSlotProps } from './feedTypes';
import {
  feedSlotMenuBtnStyle,
  getWorkspaceConceptDetails,
  hasUnreadUploadMarker,
  hexToRgba,
} from './shared';

function FeedSlot({
  slot,
  tags,
  historyReconciliationTargets,
  currentHistoryDefaultTarget,
  onCheckAndMarkProduced,
  spanCoverage = 0,
  spanColor = null,
  showSpanCoverageLabels = true,
  projectedDate = null,
  isFreshEvidence = false,
  getConceptDetails,
  onMarkProduced,
  onOpenMarkProducedDialog,
  onReconcileHistory,
  onUndoHistoryReconciliation,
  onRemoveFromSlot,
  onAssignToSlot,
  onSwapFeedOrder,
  allConcepts = [],
  onUpdateTags,
  onUpdateNote,
  onUpdateTikTokUrl,
  onPatchConcept,
  onOpenConcept,
  onSlotClick
}: FeedSlotProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [showContextMenu, setShowContextMenu] = React.useState(false);
  const menuBtnRef = React.useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number } | null>(null);
  const [showTagPicker, setShowTagPicker] = React.useState(false);
  const [checkingForClip, setCheckingForClip] = React.useState(false);
  const [noClipFound, setNoClipFound] = React.useState(false);
  const [editingNote, setEditingNote] = React.useState(false);
  const [editingTikTok, setEditingTikTok] = React.useState(false);
  const [editingPlannedDate, setEditingPlannedDate] = React.useState(false);
  const [showReconciliationPicker, setShowReconciliationPicker] = React.useState(false);
  const [selectedReconciliationTargetId, setSelectedReconciliationTargetId] = React.useState('');
  const [savingReconciliation, setSavingReconciliation] = React.useState(false);
  const [localNote, setLocalNote] = React.useState('');
  const [localTikTokUrl, setLocalTikTokUrl] = React.useState('');
  const [localPlannedDate, setLocalPlannedDate] = React.useState('');
  const [refThumbnailUrl, setRefThumbnailUrl] = React.useState<string | null>(null);

  const { concept, type } = slot;
  const details = concept ? getWorkspaceConceptDetails(concept, getConceptDetails) ?? null : null;
  const result = concept?.result ?? null;
  const markers = concept?.markers ?? null;
  const isPastSlot = slot.feedOrder < 0;
  const canAddConcept = type === 'empty' && !isPastSlot;

  // Swap neighbors: find the concepts at feed_order ± 1 for "Flytta upp/ner" (Task 12)
  const conceptFeedOrder = concept?.feed_order ?? null;
  const swapUpNeighbor = (concept != null && conceptFeedOrder != null)
    ? (allConcepts.find((c) => c.id !== concept.id && c.feed_order === conceptFeedOrder + 1) ?? null)
    : null;
  const swapDownNeighbor = (concept != null && conceptFeedOrder != null)
    ? (allConcepts.find((c) => c.id !== concept.id && c.feed_order === conceptFeedOrder - 1) ?? null)
    : null;
  const hasUnreadUpload = hasUnreadUploadMarker(concept);
  const linkedHistoryConcept =
    concept?.reconciliation.linked_customer_concept_id != null
      ? historyReconciliationTargets.find(
          (item) => item.id === concept.reconciliation.linked_customer_concept_id
        ) ?? null
      : null;
  const effectiveNowSlotTarget =
    currentHistoryDefaultTarget && currentHistoryDefaultTarget.id !== concept?.id
      ? currentHistoryDefaultTarget
      : null;
  const linkedHistoryDetails = linkedHistoryConcept
    ? getWorkspaceConceptDetails(linkedHistoryConcept, getConceptDetails) ?? null
    : null;
  const linkedHistoryTitle = linkedHistoryConcept
    ? getStudioCustomerConceptDisplayTitle(
        linkedHistoryConcept,
        linkedHistoryDetails?.headline_sv?.substring(0, 60) ?? linkedHistoryDetails?.headline ?? null
      )
    : null;
  const historyPrimaryTitle =
    concept?.row_kind === 'imported_history'
      ? typeof concept.content.content_overrides?.script === 'string' &&
        concept.content.content_overrides.script.trim()
        ? concept.content.content_overrides.script.trim()
        : getStudioCustomerConceptDisplayTitle(
            concept,
            details?.headline_sv?.substring(0, 60) ?? details?.headline ?? null
          )
      : concept
        ? getStudioCustomerConceptDisplayTitle(
            concept,
            details?.headline_sv?.substring(0, 60) ?? details?.headline ?? null
          )
        : null;
  const selectableHistoryTargets = historyReconciliationTargets
    .filter((item) => item.id !== concept?.id)
    .sort((a, b) => {
      const feedOrderA = a.placement.feed_order ?? Number.NEGATIVE_INFINITY;
      const feedOrderB = b.placement.feed_order ?? Number.NEGATIVE_INFINITY;
      if (feedOrderA !== feedOrderB) return feedOrderB - feedOrderA;
      return a.added_at.localeCompare(b.added_at);
    });
  const effectiveNowSlotDetails = effectiveNowSlotTarget
    ? getWorkspaceConceptDetails(effectiveNowSlotTarget, getConceptDetails) ?? null
    : null;
  const effectiveNowSlotTitle = effectiveNowSlotTarget
    ? getStudioCustomerConceptDisplayTitle(
        effectiveNowSlotTarget,
        effectiveNowSlotDetails?.headline_sv?.substring(0, 60) ?? effectiveNowSlotDetails?.headline ?? null
      )
    : null;
  const historyDateLabel = (() => {
    if (type !== 'history') return null;
    const dateValue = result?.published_at ?? result?.produced_at ?? result?.content_loaded_at ?? null;
    if (!dateValue) return null;
    return new Date(dateValue).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  })();
  const historySourceLabel = (() => {
    if (type !== 'history') return null;
    if (concept?.origin.history_source === 'tiktok_profile') return 'TikTok ground truth';
    if (concept?.origin.history_source === 'hagen_library') return 'Hagen-import';
    return null;
  })();
  const collaborationTitle = concept
    ? getStudioCustomerConceptDisplayTitle(
        concept,
        details?.headline_sv?.substring(0, 60) ?? details?.headline ?? null
      )
    : null;
  const isCustomCollaboration = Boolean(concept?.partner_name) && (type === 'planned' || type === 'current');
  const collaborationPalette = (() => {
    switch ((concept?.visual_variant ?? 'default').toLowerCase()) {
      case 'editorial':
        return {
          bg: '#F7F0E7',
          accent: '#7C4A1E',
          secondary: '#B7792B',
          text: '#2A170A',
          surface: 'rgba(255,255,255,0.56)',
          border: '1px solid rgba(124,74,30,0.2)',
        };
      case 'midnight':
        return {
          bg: '#1E1A1A',
          accent: '#F4E0B6',
          secondary: '#D2A45C',
          text: '#FFF9ED',
          surface: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(244,224,182,0.18)',
        };
      default:
        return {
          bg: '#F6EEDF',
          accent: '#6B4423',
          secondary: '#C4813A',
          text: '#2F1B0E',
          surface: 'rgba(255,255,255,0.52)',
          border: '1px solid rgba(107,68,35,0.16)',
        };
    }
  })();
  const profileInitials = (concept?.profile_name ?? concept?.partner_name ?? 'LT')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  // Fetch TikTok oEmbed thumbnail for planned/current slots
  React.useEffect(() => {
    if (type !== 'planned' && type !== 'current') return;
    if (!details?.sourceUrl) return;
    let cancelled = false;
    fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(details.sourceUrl)}`)
      .then(r => r.json())
      .then(payload => {
        if (!cancelled && typeof payload.thumbnail_url === 'string' && payload.thumbnail_url) {
          setRefThumbnailUrl(payload.thumbnail_url);
        }
      })
      .catch(() => {/* no thumbnail available */});
    return () => { cancelled = true; };
  }, [type, details?.sourceUrl]);

  const openContextMenuFromButton = () => {
    if (!menuBtnRef.current) return;
    const rect = menuBtnRef.current.getBoundingClientRect();
    const menuWidth = 220;
    const estimatedMenuHeight = type === 'history' ? 320 : 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const prefersAbove = spaceBelow < estimatedMenuHeight && rect.top > spaceBelow;
    const top = prefersAbove
      ? Math.max(8, rect.top - estimatedMenuHeight - 6)
      : Math.max(8, Math.min(window.innerHeight - estimatedMenuHeight - 8, rect.bottom + 6));
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      Math.max(8, window.innerWidth - menuWidth - 8)
    );
    setMenuPos({ top, left });
    setShowContextMenu(true);
  };

  React.useEffect(() => {
    setLocalNote(markers?.assignment_note ?? '');
    setLocalTikTokUrl(result?.tiktok_url ?? '');
    setLocalPlannedDate(result?.planned_publish_at ? result.planned_publish_at.slice(0, 10) : '');
    setEditingNote(false);
    setEditingTikTok(false);
    setEditingPlannedDate(false);
    setShowReconciliationPicker(false);
    setSelectedReconciliationTargetId(concept?.reconciliation.linked_customer_concept_id ?? '');
    setShowTagPicker(false);
  }, [
    concept?.id,
    markers?.assignment_note,
    result?.tiktok_url,
    result?.planned_publish_at,
    concept?.reconciliation.linked_customer_concept_id
  ]);

  const formatMetric = (value: number | null) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    return new Intl.NumberFormat('sv-SE', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  };

  const handleSavePlannedDate = async () => {
    if (!concept) return;
    try {
      const value = localPlannedDate ? new Date(localPlannedDate).toISOString() : null;
      await onPatchConcept(concept.id, { planned_publish_at: value });
      setEditingPlannedDate(false);
      setShowContextMenu(false);
    } catch {
      alert('Kunde inte spara planerat datum');
    }
  };

  const handleToggleTag = async (tagName: string) => {
    if (!concept) return;
    const currentTags = markers?.tags ?? [];
    const nextTags = currentTags.includes(tagName)
      ? currentTags.filter((t) => t !== tagName)
      : [...currentTags, tagName];

    try {
      await onUpdateTags(concept.id, nextTags);
    } catch (error) {
      console.error('Error updating concept tags:', error);
      alert('Kunde inte uppdatera taggar');
    }
  };

  const handleSaveNote = async () => {
    if (!concept) return;
    try {
      await onUpdateNote(concept.id, localNote);
      setEditingNote(false);
    } catch (error) {
      console.error('Error updating note:', error);
      alert('Kunde inte spara notering');
    }
  };

  const handleSaveTikTok = async () => {
    if (!concept) return;
    try {
      await onUpdateTikTokUrl(concept.id, localTikTokUrl);
      setEditingTikTok(false);
    } catch (error) {
      console.error('Error updating TikTok URL:', error);
      alert('Kunde inte spara TikTok-länk');
    }
  };

  const handleSaveHistoryReconciliation = async () => {
    if (!concept || concept.row_kind !== 'imported_history' || !selectedReconciliationTargetId) return;
    setSavingReconciliation(true);
    try {
      await onReconcileHistory(concept.id, {
        linkedCustomerConceptId: selectedReconciliationTargetId,
      });
      setShowReconciliationPicker(false);
    } finally {
      setSavingReconciliation(false);
    }
  };

  const handleMarkHistoryAsLeTrend = async () => {
    if (!concept || concept.row_kind !== 'imported_history') return;
    if (!effectiveNowSlotTarget) {
      setShowReconciliationPicker(true);
      return;
    }
    setSavingReconciliation(true);
    try {
      await onReconcileHistory(concept.id, { mode: 'use_now_slot' });
    } finally {
      setSavingReconciliation(false);
    }
  };

  const handleUndoLinkedHistory = async () => {
    if (!concept || concept.row_kind !== 'imported_history' || !concept.reconciliation.is_reconciled) return;
    setSavingReconciliation(true);
    try {
      await onUndoHistoryReconciliation(concept.id);
      setShowReconciliationPicker(false);
      setSelectedReconciliationTargetId('');
    } finally {
      setSavingReconciliation(false);
    }
  };

  // Visuell styling per slot-typ
  const slotStyles = {
    empty: {
      bg: LeTrendColors.cream,
      border: `2px dashed ${LeTrendColors.border}`,
      opacity: 1
    },
    planned: {
      bg: 'white',
      border: `1px solid rgba(74,47,24,0.1)`,
      opacity: 1
    },
    current: {
      bg: 'rgba(74,47,24,0.035)',
      border: `2px solid ${LeTrendColors.brownDark}`,
      opacity: 1
    },
    history: {
      bg: '#F0EDE8',
      border: `1px solid ${LeTrendColors.border}`,
      opacity: 0.85
    },
    brand_pad: {
      bg: 'rgba(74,47,24,0.03)',
      border: `1px dashed rgba(74,47,24,0.12)`,
      opacity: 1
    }
  };

  const style = slotStyles[type];
  const isSpanSelected = spanCoverage >= 1;
  // Tint and outline only visible when coverage labels are active (eel hovered/editing)
  const spanTint = isSpanSelected && spanColor && showSpanCoverageLabels ? hexToRgba(spanColor, 0.12) : null;
  const spanOutline = isSpanSelected && spanColor && showSpanCoverageLabels
    ? `inset 0 0 0 2px ${hexToRgba(spanColor, 0.5)}`
    : undefined;
  const showSpanCoveragePill = Boolean(showSpanCoverageLabels && isSpanSelected && spanColor);

  const [dragOver, setDragOver] = React.useState(false);
  const emptyBaseColor = canAddConcept ? style.bg : '#ECE7DF';
  const emptyBackgroundColor = dragOver ? 'rgba(107, 68, 35, 0.08)' : emptyBaseColor;
  const emptyBackgroundImage = !dragOver && spanTint
    ? `linear-gradient(${spanTint}, ${spanTint})`
    : 'none';

  // Tom slot
  if (type === 'brand_pad') {
    return (
      <div
        data-slot-index={slot.slotIndex}
        style={{
          aspectRatio: '9/16',
          maxHeight: 280,
          background: style.bg,
          border: style.border,
          borderRadius: LeTrendRadius.lg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, opacity: 0.42 }}>
          <img src="/lt-logo.png" alt="LeTrend" style={{ width: 48, height: 48, objectFit: 'contain' }} />
          <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: LeTrendColors.textMuted }}>
            LeTrend
          </span>
        </div>
      </div>
    );
  }

  if (type === 'empty') {
    return (
      <div
        data-slot-index={slot.slotIndex}
        onClick={() => {
          onSlotClick(slot, null, null);
        }}
        onDragOver={(e) => {
          if (canAddConcept) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const conceptId = e.dataTransfer.getData('text/concept-id');
          if (conceptId && canAddConcept && onAssignToSlot) {
            void onAssignToSlot(conceptId, slot.feedOrder);
          }
        }}
        style={{
          aspectRatio: '9/16',
          maxHeight: 280,
          backgroundColor: emptyBackgroundColor,
          backgroundImage: emptyBackgroundImage,
          backgroundPosition: '0% 0%',
          backgroundSize: 'auto',
          backgroundRepeat: 'repeat',
          border: dragOver
            ? `2px solid ${LeTrendColors.brownDark}`
            : canAddConcept ? style.border : `1px solid ${LeTrendColors.border}`,
          borderRadius: LeTrendRadius.lg,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: canAddConcept ? 'pointer' : 'default',
          transition: 'all 0.2s',
          boxShadow: spanOutline
        }}
        onMouseEnter={(e) => {
          if (canAddConcept) {
            e.currentTarget.style.borderStyle = 'solid';
          }
        }}
        onMouseLeave={(e) => {
          if (canAddConcept) {
            e.currentTarget.style.borderStyle = 'dashed';
          }
        }}
      >
        {showSpanCoveragePill && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: spanColor || LeTrendColors.textMuted,
              boxShadow: `0 0 0 2px ${hexToRgba(spanColor || '#999', 0.3)}`,
              pointerEvents: 'none'
            }}
          />
        )}
        {canAddConcept ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, pointerEvents: 'none', userSelect: 'none' }}>
            <span style={{ fontSize: 32, color: LeTrendColors.textMuted, opacity: 0.5 }}>+</span>
            {projectedDate && (
              <span style={{ fontSize: 9, color: LeTrendColors.textMuted, opacity: 0.38, fontStyle: 'italic', letterSpacing: '0.02em', textAlign: 'center', lineHeight: 1.2 }}>
                ~{projectedDate.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        ) : isPastSlot ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, pointerEvents: 'none', userSelect: 'none' }}>
            <span style={{ fontSize: 16, color: LeTrendColors.textMuted, opacity: 0.2, lineHeight: 1 }}>◦</span>
            <span style={{ fontSize: 9, color: LeTrendColors.textMuted, opacity: 0.35, fontStyle: 'italic', letterSpacing: '0.04em' }}>historik</span>
          </div>
        ) : null}
      </div>
    );
  }

  // Build background: thumbnail for history/planned/current, or span tint, or default
  const thumbnailUrl = result?.tiktok_thumbnail_url;
  const effectiveThumbnailUrl = type === 'history' ? thumbnailUrl : refThumbnailUrl;
  const hasThumbnail = !!effectiveThumbnailUrl;
  const hasHistoryThumbnail = type === 'history' && hasThumbnail;
  const isOnThumbnail = hasThumbnail && (type === 'planned' || type === 'current');
  const slotBackgroundColor = isCustomCollaboration ? collaborationPalette.bg : style.bg;
  const slotBackgroundImage = hasHistoryThumbnail
    ? `linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 50%, transparent 100%), url(${effectiveThumbnailUrl})`
    : isCustomCollaboration
      ? `radial-gradient(circle at top left, ${hexToRgba(collaborationPalette.secondary, 0.22)} 0%, transparent 46%), linear-gradient(160deg, ${collaborationPalette.bg} 0%, ${hexToRgba(collaborationPalette.secondary, 0.18)} 100%)`
      : hasThumbnail
        ? `linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.18) 30%, rgba(0,0,0,0.22) 58%, rgba(0,0,0,0.80) 100%), url(${effectiveThumbnailUrl})`
    : spanTint
      ? `linear-gradient(${spanTint}, ${spanTint})`
      : 'none';

  // Filled slot
  return (
    <div
      data-slot-index={slot.slotIndex}
      style={{
        aspectRatio: '9/16',
        maxHeight: 280,
        backgroundColor: slotBackgroundColor,
        backgroundImage: slotBackgroundImage,
        backgroundSize: hasThumbnail ? 'cover' : 'auto',
        backgroundPosition: hasThumbnail ? 'center' : '0% 0%',
        backgroundRepeat: hasThumbnail ? 'no-repeat' : 'repeat',
        border: isFreshEvidence && type === 'history' ? '2px solid rgba(22, 101, 52, 0.55)' : style.border,
        borderRadius: LeTrendRadius.lg,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        opacity: isFreshEvidence && type === 'history' ? 1 : style.opacity,
        cursor: 'pointer',
        filter: type === 'history' ? (isHovered ? 'saturate(1)' : 'saturate(0.82)') : undefined,
        transition: type === 'history' ? 'filter 0.2s' : undefined,
        boxShadow: [
          spanOutline,
          isFreshEvidence && type === 'history' ? '0 0 0 3px rgba(22, 101, 52, 0.15)' : null,
          isCustomCollaboration ? '0 16px 36px rgba(107,68,35,0.12)' : null,
          hasThumbnail ? 'inset 0 0 0 1px rgba(255,255,255,0.07)' : null,
        ].filter(Boolean).join(', ') || undefined
      }}
      onClick={() => {
        // Historik — always open context menu; activate URL editor only when no link exists yet
        if (type === 'history' && concept) {
          openContextMenuFromButton();
          if (!result?.tiktok_url) setEditingTikTok(true);
          return;
        }
        onSlotClick(slot, concept, details);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {showSpanCoveragePill && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: spanColor || LeTrendColors.textMuted,
            boxShadow: `0 0 0 2px ${hexToRgba(spanColor || '#999', 0.3)}`,
            pointerEvents: 'none'
          }}
        />
      )}

      {/* Fresh-evidence badge — shown when CM arrived via "Granska historiken" from the motor cue */}
      {isFreshEvidence && type === 'history' && (
        <div style={{
          position: 'absolute',
          top: 6,
          right: 6,
          background: '#166534',
          color: 'rgba(255,255,255,0.92)',
          padding: '1px 5px',
          borderRadius: LeTrendRadius.sm,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.04em',
          pointerEvents: 'none',
          zIndex: 3,
        }}>
          nytt
        </div>
      )}

      {result?.content_loaded_at && (
        <div
          style={{
            position: 'absolute',
            top: type === 'history' ? 32 : 8,
            left: 8,
            background: hasHistoryThumbnail
              ? 'rgba(0,0,0,0.5)'
              : hasUnreadUpload
                ? 'rgba(16, 185, 129, 0.14)'
                : 'rgba(107,114,128,0.12)',
            color: hasHistoryThumbnail ? '#fff' : hasUnreadUpload ? '#047857' : '#4b5563',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            border: hasHistoryThumbnail
              ? '1px solid rgba(255,255,255,0.14)'
              : hasUnreadUpload
                ? '1px solid rgba(16, 185, 129, 0.45)'
                : '1px solid rgba(107,114,128,0.25)',
            backdropFilter: hasHistoryThumbnail ? 'blur(4px)' : undefined,
          }}
          title={hasUnreadUpload ? 'Ny uppladdning' : 'Uppladdning sedd'}
        >
          {hasUnreadUpload ? 'Ny uppladdning' : 'Uppladdning sedd'}
        </div>
      )}

      {/* Context menu icon */}
      {concept && (isHovered || showContextMenu) && (
        <button
          ref={menuBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            if (!showContextMenu) {
              openContextMenuFromButton();
              return;
            }
            setShowContextMenu(v => !v);
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: hasHistoryThumbnail ? 'rgba(255,255,255,0.88)' : LeTrendColors.textMuted
          }}
        >
          ⋯
        </button>
      )}

      {/* Koncept-innehåll — v2 layout för planned/current och history */}
      {concept && isCustomCollaboration ? (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, minHeight: 0, color: collaborationPalette.text }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, background: collaborationPalette.surface, border: collaborationPalette.border }}>
                <img src="/lt-logo.png" alt="LeTrend" aria-hidden="true" style={{ width: 15, height: 15, objectFit: 'contain', flexShrink: 0 }} />
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: collaborationPalette.accent }}>
                  Samarbete
                </span>
              </div>
              {type === 'current' && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: collaborationPalette.accent, color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: collaborationPalette.secondary, flexShrink: 0 }} />
                  Nu
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {concept.profile_image_url ? (
                <img
                  src={concept.profile_image_url}
                  alt={concept.profile_name ?? concept.partner_name ?? 'Profil'}
                  style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${hexToRgba(collaborationPalette.accent, 0.18)}`, flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 42, height: 42, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexToRgba(collaborationPalette.accent, 0.12), border: `1px solid ${hexToRgba(collaborationPalette.accent, 0.2)}`, color: collaborationPalette.accent, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {profileInitials}
                </div>
              )}
              <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, color: collaborationPalette.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {concept.partner_name}
                </span>
                <span style={{ fontSize: 10, color: hexToRgba(collaborationPalette.text, 0.72), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {concept.profile_name ?? 'Utvalt samarbete'}
                </span>
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35, color: collaborationPalette.text, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' as const }}>
              {collaborationTitle}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {markers && markers.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {markers.tags.slice(0, 2).map((tagName) => {
                  const tag = tags.find(t => t.name === tagName);
                  return (
                    <span key={tagName} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, padding: '3px 8px 3px 6px', fontSize: 9.5, fontWeight: 600, background: collaborationPalette.surface, border: collaborationPalette.border, color: tag?.color ?? collaborationPalette.accent }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: tag?.color ?? collaborationPalette.secondary, flexShrink: 0, display: 'inline-block' }} />
                      {tagName}
                    </span>
                  );
                })}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 10.5, color: hexToRgba(collaborationPalette.text, 0.72) }}>
              <span>
                {result?.planned_publish_at
                  ? new Date(result.planned_publish_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
                  : projectedDate
                    ? `~${projectedDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`
                    : 'Ingen plan satt'}
              </span>
              <span style={{ textTransform: 'capitalize' }}>
                {concept.visual_variant && concept.visual_variant !== 'default' ? concept.visual_variant : 'premium'}
              </span>
            </div>

            {type === 'current' && !checkingForClip && !noClipFound && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenMarkProducedDialog) {
                    onOpenMarkProducedDialog(concept.id);
                  } else {
                    setCheckingForClip(true);
                    setNoClipFound(false);
                    void onCheckAndMarkProduced(concept.id).then((res) => {
                      setCheckingForClip(false);
                      if (res === 'no_clip') setNoClipFound(true);
                    });
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: `1px solid ${hexToRgba(collaborationPalette.accent, 0.2)}`,
                  background: collaborationPalette.surface,
                  borderRadius: 7,
                  padding: '6px 9px',
                  cursor: 'pointer',
                  width: '100%',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{
                  width: 15,
                  height: 15,
                  borderRadius: '50%',
                  background: collaborationPalette.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="8" height="6" viewBox="0 0 8 6">
                    <polyline points="1,3 3,5 7,1" stroke="#FAF8F5" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: collaborationPalette.text, whiteSpace: 'nowrap' }}>
                  Markera som gjord
                </span>
              </button>
            )}

            {type === 'current' && checkingForClip && (
              <div style={{ fontSize: 10, color: hexToRgba(collaborationPalette.text, 0.72), fontStyle: 'italic', padding: '6px 0' }}>
                Soker efter nytt klipp...
              </div>
            )}

            {type === 'current' && noClipFound && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  border: `1px solid ${hexToRgba(collaborationPalette.accent, 0.28)}`,
                  borderRadius: 7,
                  padding: '7px 9px',
                  background: collaborationPalette.surface,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 9.5, fontWeight: 600, color: collaborationPalette.text, lineHeight: 1.4 }}>
                  Inget nytt klipp hittades pa profilen.
                </span>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoClipFound(false);
                      void onMarkProduced(concept.id);
                    }}
                    style={{
                      flex: 1,
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '5px 0',
                      border: 'none',
                      borderRadius: 5,
                      cursor: 'pointer',
                      background: collaborationPalette.accent,
                      color: 'white',
                      fontFamily: 'inherit',
                    }}
                  >
                    Markera anda
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoClipFound(false);
                    }}
                    style={{
                      flex: 1,
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '5px 0',
                      border: `1px solid ${hexToRgba(collaborationPalette.accent, 0.16)}`,
                      borderRadius: 5,
                      cursor: 'pointer',
                      background: 'transparent',
                      color: collaborationPalette.text,
                      fontFamily: 'inherit',
                    }}
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : concept && (type === 'planned' || type === 'current') ? (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, minHeight: 0 }}>
          {/* Övre: Nu-badge (current) + titel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {type === 'current' && (
              <div style={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: '#4A2F18',
                color: '#FAF8F5',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                padding: '3px 7px 3px 5px',
                borderRadius: 5,
              }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#C4813A', flexShrink: 0 }} />
                Nu
              </div>
            )}
            <div style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: isOnThumbnail ? 'rgba(255,255,255,0.95)' : '#1a1008',
              lineHeight: 1.35,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: type === 'current' ? 3 : 4,
              WebkitBoxOrient: 'vertical' as const,
            }}>
              {getStudioCustomerConceptDisplayTitle(
                concept,
                details?.headline_sv?.substring(0, 60) ?? details?.headline ?? null
              )}
            </div>
          </div>

          {/* Nedre: taggar + notering + datum + markera-knapp */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {/* Taggar som pills */}
            {markers && markers.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {markers.tags.slice(0, 2).map((tagName) => {
                  const tag = tags.find(t => t.name === tagName);
                  if (!tag) return null;
                  return (
                    <span key={tagName} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      borderRadius: 5,
                      padding: '2px 6px 2px 4px',
                      fontSize: 9.5,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      background: `${tag.color}1a`,
                      color: tag.color,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: tag.color, flexShrink: 0, display: 'inline-block' }} />
                      {tagName}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Notering — ikon + trunkerad text + title-tooltip */}
            {markers?.assignment_note && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, marginTop: 1, opacity: 0.35, color: isOnThumbnail ? '#fff' : '#4A2F18' }}>
                  <rect x="1.5" y="1.5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="3.5" y1="4.5" x2="9.5" y2="4.5" stroke="currentColor" strokeWidth="1"/>
                  <line x1="3.5" y1="6.5" x2="7.5" y2="6.5" stroke="currentColor" strokeWidth="1"/>
                </svg>
                <span
                  title={markers.assignment_note}
                  style={{
                    fontSize: 10,
                    color: isOnThumbnail ? 'rgba(255,255,255,0.72)' : '#9CA3AF',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.3,
                  }}
                >
                  {markers.assignment_note}
                </span>
              </div>
            )}

            {/* Datum */}
            {(() => {
              const realDate = result?.planned_publish_at ?? result?.content_loaded_at ?? null;
              if (realDate) {
                return (
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: isOnThumbnail ? 'rgba(255,255,255,0.82)' : '#6B7280' }}>
                    {new Date(realDate).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                  </div>
                );
              }
              if (projectedDate) {
                return (
                  <div style={{ fontSize: 11, fontStyle: 'italic', color: isOnThumbnail ? 'rgba(255,255,255,0.62)' : '#9CA3AF' }}>
                    ~{projectedDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                  </div>
                );
              }
              return null;
            })()}

            {/* Markera-knapp — bara på Nu-kort — öppnar MarkProducedDialog */}
            {type === 'current' && !checkingForClip && !noClipFound && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenMarkProducedDialog) {
                    onOpenMarkProducedDialog(concept.id);
                  } else {
                    // Fallback: check for clip then open inline flow
                    setCheckingForClip(true);
                    setNoClipFound(false);
                    void onCheckAndMarkProduced(concept.id).then((res) => {
                      setCheckingForClip(false);
                      if (res === 'no_clip') setNoClipFound(true);
                    });
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: isOnThumbnail ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(74,47,24,0.18)',
                  background: isOnThumbnail ? 'rgba(0,0,0,0.25)' : 'transparent',
                  borderRadius: 7,
                  padding: '6px 9px',
                  cursor: 'pointer',
                  width: '100%',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{
                  width: 15,
                  height: 15,
                  borderRadius: '50%',
                  background: '#4A2F18',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="8" height="6" viewBox="0 0 8 6">
                    <polyline points="1,3 3,5 7,1" stroke="#FAF8F5" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: isOnThumbnail ? 'rgba(255,255,255,0.9)' : '#4A2F18', whiteSpace: 'nowrap' }}>
                  Markera som gjord
                </span>
              </button>
            )}

            {/* Söker efter klipp — loading state */}
            {type === 'current' && checkingForClip && (
              <div style={{ fontSize: 10, color: LeTrendColors.textMuted, fontStyle: 'italic', padding: '6px 0' }}>
                Söker efter nytt klipp...
              </div>
            )}

            {/* Inget klipp hittat — CM kan ändå bekräfta eller avbryta */}
            {type === 'current' && noClipFound && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  border: '1px solid rgba(180,83,9,0.35)',
                  borderRadius: 7,
                  padding: '7px 9px',
                  background: 'rgba(180,83,9,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 9.5, fontWeight: 600, color: '#92400e', lineHeight: 1.4 }}>
                  Inget nytt klipp hittades på profilen.
                </span>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoClipFound(false);
                      void onMarkProduced(concept.id);
                    }}
                    style={{
                      flex: 1,
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '5px 0',
                      border: 'none',
                      borderRadius: 5,
                      cursor: 'pointer',
                      background: '#92400e',
                      color: 'white',
                      fontFamily: 'inherit',
                    }}
                  >
                    Markera ändå
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoClipFound(false);
                    }}
                    style={{
                      flex: 1,
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '5px 0',
                      border: '1px solid rgba(74,47,24,0.2)',
                      borderRadius: 5,
                      cursor: 'pointer',
                      background: 'transparent',
                      color: '#4A2F18',
                      fontFamily: 'inherit',
                    }}
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : concept && type === 'history' ? (
        /* History layout v2 — logo top, tags+title+date+note+stats bottom */
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, minHeight: 0 }}>
          {/* Top row: source identity */}
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            {concept.row_kind === 'assignment' ? (
              <img
                src="/lt-logo.png"
                alt="LeTrend"
                aria-hidden="true"
                style={{ width: 21, height: 21, opacity: hasThumbnail ? 0.88 : 0.6, filter: hasThumbnail ? 'brightness(10)' : undefined, objectFit: 'contain', pointerEvents: 'none', userSelect: 'none', flexShrink: 0 }}
              />
            ) : (
              <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, flexShrink: 0, opacity: hasThumbnail ? 0.78 : 0.55 }} fill={hasThumbnail ? 'rgba(255,255,255,0.75)' : LeTrendColors.textMuted}>
                <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743l-.002-.001.002.001a2.895 2.895 0 0 1 3.183-4.51v-3.5a6.329 6.329 0 0 0-5.394 10.692 6.33 6.33 0 0 0 10.857-4.424V8.687a8.182 8.182 0 0 0 4.773 1.526V6.79a4.831 4.831 0 0 1-1.003-.104z"/>
              </svg>
            )}
          </div>

          {/* Bottom: tags + title + date + note + StatRow */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {/* Tag pills */}
            {markers && markers.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {markers.tags.slice(0, 2).map((tagName) => {
                  const tag = tags.find(t => t.name === tagName);
                  return (
                    <span key={tagName} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 2.5,
                      background: hasHistoryThumbnail ? 'rgba(0,0,0,0.5)' : `${tag?.color ?? '#999'}1a`,
                      borderRadius: 4, padding: '1.5px 5px 1.5px 3.5px',
                      fontSize: 9, fontWeight: 500,
                      color: hasHistoryThumbnail ? '#fff' : (tag?.color ?? LeTrendColors.textMuted),
                      border: hasHistoryThumbnail ? '1px solid rgba(255,255,255,0.12)' : undefined,
                      backdropFilter: hasHistoryThumbnail ? 'blur(4px)' : undefined,
                      whiteSpace: 'nowrap',
                    }}>
                      {tag && <span style={{ width: 5, height: 5, borderRadius: '50%', background: tag.color, flexShrink: 0, display: 'inline-block' }} />}
                      {tagName}
                    </span>
                  );
                })}
              </div>
            )}
            {/* Title — TikTok clips show video description, LeTrend shows concept headline */}
            <div style={{
              fontSize: 12, fontWeight: 600,
              color: hasHistoryThumbnail ? '#fff' : LeTrendColors.brownDark,
              lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: concept.row_kind === 'imported_history' ? 4 : 3,
              WebkitBoxOrient: 'vertical' as const,
              textShadow: hasHistoryThumbnail ? '0 1px 3px rgba(0,0,0,0.6)' : undefined,
            }}>
              {historyPrimaryTitle}
            </div>
            {historyDateLabel && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: hasHistoryThumbnail ? 'rgba(255,255,255,0.82)' : LeTrendColors.textMuted,
                  lineHeight: 1.1,
                  textShadow: hasHistoryThumbnail ? '0 1px 3px rgba(0,0,0,0.6)' : undefined,
                }}
              >
                {historyDateLabel}
              </div>
            )}
            {historySourceLabel && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '3px 6px',
                  borderRadius: 999,
                  background: hasHistoryThumbnail ? 'rgba(255,255,255,0.18)' : 'rgba(74,47,24,0.08)',
                  color: hasHistoryThumbnail ? '#fff' : LeTrendColors.textSecondary,
                  border: hasHistoryThumbnail ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(74,47,24,0.08)',
                  textShadow: hasHistoryThumbnail ? '0 1px 3px rgba(0,0,0,0.6)' : undefined,
                }}
              >
                {historySourceLabel}
              </div>
            )}
            {concept.row_kind === 'imported_history' && linkedHistoryTitle && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 9.5,
                  fontWeight: 600,
                  color: hasHistoryThumbnail ? 'rgba(255,255,255,0.88)' : '#0f766e',
                  lineHeight: 1.35,
                  textShadow: hasHistoryThumbnail ? '0 1px 3px rgba(0,0,0,0.6)' : undefined,
                }}
              >
                <span style={{ opacity: 0.72 }}>LeTrend:</span>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {linkedHistoryTitle}
                </span>
              </div>
            )}
            {/* Note preview */}
            {markers?.assignment_note && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: hasHistoryThumbnail ? 'rgba(255,255,255,0.48)' : 'rgba(74,47,24,0.35)', flexShrink: 0 }} />
                <span title={markers.assignment_note} style={{
                  fontSize: 9.5, color: hasHistoryThumbnail ? 'rgba(255,255,255,0.78)' : '#9CA3AF',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: 118, fontStyle: 'italic',
                  textShadow: hasHistoryThumbnail ? '0 1px 3px rgba(0,0,0,0.6)' : undefined,
                }}>
                  {markers.assignment_note}
                </span>
              </div>
            )}
            {/* StatRow: views | likes | comments — shown for both LeTrend and TikTok cards when stats are available */}
            {(() => {
              const statItems = [
                result?.tiktok_views != null ? { key: 'views', value: result.tiktok_views } : null,
                result?.tiktok_likes != null ? { key: 'likes', value: result.tiktok_likes } : null,
                result?.tiktok_comments != null ? { key: 'comments', value: result.tiktok_comments } : null,
              ].filter((s): s is { key: string; value: number } => s !== null);
              if (statItems.length === 0) return null;
              const iconColor = hasHistoryThumbnail ? 'rgba(255,255,255,0.82)' : LeTrendColors.textMuted;
              const dividerColor = hasHistoryThumbnail ? 'rgba(255,255,255,0.18)' : 'rgba(74,47,24,0.12)';
              const textColor = hasHistoryThumbnail ? '#fff' : LeTrendColors.brownDark;
              return (
                <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${hasHistoryThumbnail ? 'rgba(255,255,255,0.14)' : 'rgba(74,47,24,0.1)'}`, paddingTop: 6, gap: 2 }}>
                  {statItems.map((stat, idx) => (
                    <React.Fragment key={stat.key}>
                      {idx > 0 && <div style={{ width: 1, height: 11, background: dividerColor, margin: '0 3px', flexShrink: 0 }} />}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}>
                        {stat.key === 'views' && (
                          <svg style={{ width: 12, height: 12, opacity: 0.65, flexShrink: 0 }} viewBox="0 0 13 13" fill="none">
                            <polygon points="3,2 11,6.5 3,11" fill={iconColor} />
                          </svg>
                        )}
                        {stat.key === 'likes' && (
                          <svg style={{ width: 12, height: 12, opacity: 0.65, flexShrink: 0 }} viewBox="0 0 13 13" fill="none">
                            <path d="M6.5 10.5C6.5 10.5 1.5 7 1.5 4.5a2.5 2.5 0 015 0 2.5 2.5 0 015 0c0 2.5-5 6-5 6z" fill={iconColor} />
                          </svg>
                        )}
                        {stat.key === 'comments' && (
                          <svg style={{ width: 12, height: 12, opacity: 0.65, flexShrink: 0 }} viewBox="0 0 13 13" fill="none">
                            <path d="M2 2.5Q2 1.5 3 1.5h7Q11 1.5 11 2.5V8Q11 9 10 9H7L5.5 11 4 9H3Q2 9 2 8Z" stroke={iconColor} strokeWidth="1.1" strokeLinejoin="round" fill="none" />
                          </svg>
                        )}
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: textColor, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formatMetric(stat.value)}
                        </span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

      {/* Context menu — viewport-fixed positioning, backdrop for click-outside */}
      {showContextMenu && concept && menuPos && (<>
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); }}
        />
        <div
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            background: 'white',
            border: `1px solid ${LeTrendColors.border}`,
            borderRadius: LeTrendRadius.md,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 100,
            width: 220,
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: 'min(360px, 55vh)',
            overflowY: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── KOMMANDE ── */}
          {type === 'planned' && (<>
            <button onClick={(e) => { e.stopPropagation(); onOpenConcept(concept.id, ['script', 'instructions', 'fit']); setShowContextMenu(false); }} style={feedSlotMenuBtnStyle}>
              Redigera koncept
            </button>
            <button onClick={(e) => {
              e.stopPropagation();
              if (!editingPlannedDate && !result?.planned_publish_at && projectedDate) {
                setLocalPlannedDate(projectedDate.toISOString().slice(0, 10));
              }
              setEditingPlannedDate(p => !p);
            }} style={feedSlotMenuBtnStyle}>
              {editingPlannedDate
                ? 'Avbryt'
                : result?.planned_publish_at
                  ? 'Redigera planerad publicering'
                  : projectedDate
                    ? `Sätt planerad publicering (~${projectedDate.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })})`
                    : 'Sätt planerad publicering'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowTagPicker(p => !p); }} style={feedSlotMenuBtnStyle}>
              {showTagPicker ? 'Dölj taggar' : 'Hantera taggar'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setEditingNote(p => !p); }} style={feedSlotMenuBtnStyle}>
              {editingNote ? 'Avbryt notering' : markers?.assignment_note ? 'Redigera notering' : 'Lägg till notering'}
            </button>
            {/* Flytta upp/ner — byter feed_order med grannen atomärt (Task 12) */}
            {swapUpNeighbor && onSwapFeedOrder && (
              <button onClick={(e) => { e.stopPropagation(); void onSwapFeedOrder(concept.id, swapUpNeighbor.id); setShowContextMenu(false); }} style={feedSlotMenuBtnStyle}>
                ↑ Flytta upp
              </button>
            )}
            {swapDownNeighbor && onSwapFeedOrder && (
              <button onClick={(e) => { e.stopPropagation(); void onSwapFeedOrder(concept.id, swapDownNeighbor.id); setShowContextMenu(false); }} style={feedSlotMenuBtnStyle}>
                ↓ Flytta ner
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); void onRemoveFromSlot(concept.id); setShowContextMenu(false); }} style={{ ...feedSlotMenuBtnStyle, color: '#b91c1c' }}>
              Ta bort från flödet
            </button>
          </>)}

          {/* ── NU ── */}
          {type === 'current' && (<>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowContextMenu(false);
                if (onOpenMarkProducedDialog) onOpenMarkProducedDialog(concept.id);
              }}
              style={{ ...feedSlotMenuBtnStyle, fontWeight: 600 }}
            >
              Markera som gjord
            </button>
            <button onClick={(e) => { e.stopPropagation(); onOpenConcept(concept.id, ['script', 'instructions', 'fit']); setShowContextMenu(false); }} style={feedSlotMenuBtnStyle}>
              Redigera koncept
            </button>
            <button onClick={(e) => {
              e.stopPropagation();
              if (!editingPlannedDate && !result?.planned_publish_at && projectedDate) {
                setLocalPlannedDate(projectedDate.toISOString().slice(0, 10));
              }
              setEditingPlannedDate(p => !p);
            }} style={feedSlotMenuBtnStyle}>
              {editingPlannedDate
                ? 'Avbryt'
                : result?.planned_publish_at
                  ? 'Redigera planerad publicering'
                  : projectedDate
                    ? `Sätt planerad publicering (~${projectedDate.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })})`
                    : 'Sätt planerad publicering'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowTagPicker(p => !p); }} style={feedSlotMenuBtnStyle}>
              {showTagPicker ? 'Dölj taggar' : 'Hantera taggar'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setEditingNote(p => !p); }} style={feedSlotMenuBtnStyle}>
              {editingNote ? 'Avbryt notering' : markers?.assignment_note ? 'Redigera notering' : 'Lägg till notering'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); void onRemoveFromSlot(concept.id); setShowContextMenu(false); }} style={{ ...feedSlotMenuBtnStyle, color: '#b91c1c' }}>
              Ta bort från flödet
            </button>
          </>)}

          {/* ── HISTORIK ── */}
          {type === 'history' && (<>
            {result?.tiktok_url && (
              <button onClick={(e) => { e.stopPropagation(); window.open(result.tiktok_url!, '_blank', 'noopener,noreferrer'); setShowContextMenu(false); }} style={feedSlotMenuBtnStyle}>
                Öppna TikTok ↗
              </button>
            )}
            {linkedHistoryConcept && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenConcept(linkedHistoryConcept.id, ['script', 'instructions', 'fit']);
                  setShowContextMenu(false);
                }}
                style={feedSlotMenuBtnStyle}
              >
                Öppna kopplat LeTrend-koncept
              </button>
            )}
            {concept.row_kind === 'assignment' && (
              <button onClick={(e) => { e.stopPropagation(); setEditingNote(p => !p); }} style={feedSlotMenuBtnStyle}>
                {editingNote ? 'Avbryt notering' : markers?.assignment_note ? 'Redigera notering' : 'Lägg till notering'}
              </button>
            )}
            {concept.row_kind === 'assignment' && concept.reconciliation.reconciled_clip_id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void onUndoHistoryReconciliation(concept.reconciliation.reconciled_clip_id!);
                  setShowContextMenu(false);
                }}
                disabled={savingReconciliation}
                style={{
                  ...feedSlotMenuBtnStyle,
                  opacity: savingReconciliation ? 0.6 : 1,
                  cursor: savingReconciliation ? 'default' : 'pointer',
                  color: '#92400e',
                }}
              >
                {savingReconciliation ? 'Sparar...' : 'Ångra koppling (visa som TikTok)'}
              </button>
            )}
            {concept.row_kind === 'imported_history' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (concept.reconciliation.is_reconciled) {
                    void handleUndoLinkedHistory();
                    return;
                  }
                  void handleMarkHistoryAsLeTrend();
                }}
                disabled={savingReconciliation}
                style={{
                  ...feedSlotMenuBtnStyle,
                  opacity: savingReconciliation ? 0.6 : 1,
                  cursor: savingReconciliation ? 'default' : 'pointer',
                }}
              >
                {savingReconciliation
                  ? 'Sparar...'
                  : concept.reconciliation.is_reconciled
                    ? 'Markera som TikTok'
                    : 'Markera som LeTrend'}
              </button>
            )}
            {concept.row_kind === 'imported_history' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowReconciliationPicker((prev) => !prev);
                  if (!selectedReconciliationTargetId) {
                    setSelectedReconciliationTargetId(
                      linkedHistoryConcept?.id ?? effectiveNowSlotTarget?.id ?? ''
                    );
                  }
                }}
                style={feedSlotMenuBtnStyle}
              >
                {showReconciliationPicker ? 'Dölj konceptval' : 'Välj LeTrend-koncept...'}
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); setEditingTikTok(p => !p); }} style={feedSlotMenuBtnStyle}>
              {editingTikTok ? 'Avbryt' : result?.tiktok_url ? 'Redigera TikTok-länk' : 'Lägg till TikTok-länk'}
            </button>
            {concept.row_kind !== 'assignment' && (
              <button onClick={(e) => { e.stopPropagation(); setEditingNote(p => !p); }} style={feedSlotMenuBtnStyle}>
                {editingNote ? 'Avbryt notering' : markers?.assignment_note ? 'Redigera notering' : 'Lägg till notering'}
              </button>
            )}
          </>)}

          {showReconciliationPicker && type === 'history' && concept.row_kind === 'imported_history' && (
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, padding: 8, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 11, color: LeTrendColors.textSecondary, lineHeight: 1.5 }}>
                {effectiveNowSlotTitle
                  ? `Nu-slot används normalt som default: ${effectiveNowSlotTitle}. Välj annat koncept bara om uppladdningen inte gäller nu-slotten.`
                  : 'Inget aktivt nu-slot-koncept hittades. Välj LeTrend-koncept manuellt om klippet ska behandlas som LeTrend.'}
              </div>
              <select
                value={selectedReconciliationTargetId}
                onChange={(e) => setSelectedReconciliationTargetId(e.target.value)}
                style={{
                  width: '100%',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.sm,
                  padding: 6,
                  fontSize: 12,
                  background: '#fff',
                }}
              >
                <option value="">Välj LeTrend-koncept...</option>
                {selectableHistoryTargets.map((target) => {
                  const targetDetails = getWorkspaceConceptDetails(target, getConceptDetails) ?? null;
                  const targetTitle = getStudioCustomerConceptDisplayTitle(
                    target,
                    targetDetails?.headline_sv?.substring(0, 60) ?? targetDetails?.headline ?? null
                  );
                  return (
                    <option key={target.id} value={target.id}>
                      {`${targetTitle} · ${getStudioFeedOrderLabel(target.placement.feed_order)}`}
                    </option>
                  );
                })}
              </select>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSaveHistoryReconciliation();
                }}
                disabled={!selectedReconciliationTargetId || savingReconciliation}
                style={{
                  width: '100%',
                  padding: 6,
                  border: 'none',
                  borderRadius: LeTrendRadius.sm,
                  background:
                    !selectedReconciliationTargetId || savingReconciliation
                      ? 'rgba(107,68,35,0.35)'
                      : '#0f766e',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor:
                    !selectedReconciliationTargetId || savingReconciliation ? 'default' : 'pointer',
                }}
              >
                {savingReconciliation
                  ? 'Sparar koppling...'
                  : concept.reconciliation.is_reconciled
                    ? 'Spara ny koppling'
                    : 'Spara koppling'}
              </button>
            </div>
          )}

          {/* Shared: tag picker (kommande + nu only) */}
          {showTagPicker && type !== 'history' && (
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, maxHeight: 160, overflowY: 'auto' }}>
              {tags.length === 0 ? (
                <div style={{ padding: 8, fontSize: 12, color: LeTrendColors.textMuted }}>Inga taggar skapade ännu</div>
              ) : tags.map((tag) => {
                const selected = (markers?.tags ?? []).includes(tag.name);
                return (
                  <button key={tag.id} onClick={(e) => { e.stopPropagation(); void handleToggleTag(tag.name); }}
                    style={{ width: '100%', padding: '8px 10px', border: 'none', background: selected ? 'rgba(74,47,24,0.08)' : 'white', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: tag.color, display: 'inline-block' }} />
                    <span style={{ flex: 1, textAlign: 'left' }}>{tag.name}</span>
                    <span style={{ opacity: selected ? 1 : 0.25 }}>✓</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Shared: note editor */}
          {editingNote && (
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, padding: 8 }}>
              <textarea value={localNote} onChange={(e) => setLocalNote(e.target.value)} rows={3} placeholder="Intern notering..."
                style={{ width: '100%', border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, padding: 6, fontSize: 12, resize: 'vertical' }} />
              <button onClick={(e) => { e.stopPropagation(); void handleSaveNote(); }}
                style={{ marginTop: 8, width: '100%', padding: 6, border: 'none', borderRadius: LeTrendRadius.sm, background: LeTrendColors.brownLight, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Spara notering
              </button>
            </div>
          )}

          {/* Historik: TikTok URL editor */}
          {editingTikTok && type === 'history' && (
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, padding: 8 }}>
              <input value={localTikTokUrl} onChange={(e) => setLocalTikTokUrl(e.target.value)} placeholder="https://www.tiktok.com/..."
                style={{ width: '100%', border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, padding: 6, fontSize: 12 }} />
              <button onClick={(e) => { e.stopPropagation(); void handleSaveTikTok(); }}
                style={{ marginTop: 8, width: '100%', padding: 6, border: 'none', borderRadius: LeTrendRadius.sm, background: LeTrendColors.brownLight, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Spara TikTok-länk
              </button>
            </div>
          )}

          {/* Planerat datum editor — kommande + nu */}
          {editingPlannedDate && (type === 'planned' || type === 'current') && (
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, padding: 8 }}>
              <input type="date" value={localPlannedDate} onChange={(e) => setLocalPlannedDate(e.target.value)}
                style={{ width: '100%', border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.sm, padding: 6, fontSize: 12 }} />
              {!result?.planned_publish_at && projectedDate && localPlannedDate === projectedDate.toISOString().slice(0, 10) && (
                <div style={{ fontSize: 9, color: LeTrendColors.textMuted, opacity: 0.55, fontStyle: 'italic', marginTop: 3 }}>
                  Förslag från rytm
                </div>
              )}
              <button onClick={(e) => { e.stopPropagation(); void handleSavePlannedDate(); }}
                style={{ marginTop: 8, width: '100%', padding: 6, border: 'none', borderRadius: LeTrendRadius.sm, background: LeTrendColors.brownLight, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Spara datum
              </button>
            </div>
          )}

        </div>
      </>)}
    </div>
  );
}

export { FeedSlot };
