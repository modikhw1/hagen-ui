import React from 'react';
import ReactDOM from 'react-dom';
import type { TranslatedConcept } from '@/lib/translator';
import type { ConceptSectionKey } from '@/lib/studio-v2-concept-content';
import {
  getStudioCustomerConceptDisplayTitle,
  getStudioCustomerConceptSourceConceptId,
} from '@/lib/studio/customer-concepts';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CmTag, CustomerConcept, FeedSlot as FeedSlotData } from '@/types/studio-v2';
import { hasUnreadUploadMarker, hexToRgba } from './shared';

interface CustomerFeedSlotProps {
  slot: FeedSlotData;
  tags: CmTag[];
  spanCoverage?: number;
  spanColor?: string | null;
  showSpanCoverageLabels?: boolean;
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  onMarkProduced: (conceptId: string, tiktokUrl?: string) => Promise<void>;
  onRemoveFromSlot: (conceptId: string) => Promise<void>;
  onAssignToSlot?: (conceptId: string, feedOrder: number) => Promise<void>;
  onUpdateTags: (conceptId: string, tags: string[]) => Promise<void>;
  onUpdateNote: (conceptId: string, note: string) => Promise<void>;
  onUpdateTikTokUrl: (conceptId: string, url: string) => Promise<void>;
  onPatchConcept: (conceptId: string, updates: Partial<CustomerConcept>) => Promise<void>;
  onOpenConcept: (conceptId: string, sections?: ConceptSectionKey[]) => void;
  onSlotClick: (
    slot: FeedSlotData,
    concept: CustomerConcept | null,
    details: TranslatedConcept | null
  ) => void;
}

export function CustomerFeedSlot({
  slot,
  tags,
  spanCoverage = 0,
  spanColor = null,
  showSpanCoverageLabels = true,
  getConceptDetails,
  onMarkProduced,
  onRemoveFromSlot,
  onAssignToSlot,
  onUpdateTags,
  onUpdateNote,
  onUpdateTikTokUrl,
  onPatchConcept,
  onOpenConcept,
  onSlotClick,
}: CustomerFeedSlotProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [showContextMenu, setShowContextMenu] = React.useState(false);
  const [showTagPicker, setShowTagPicker] = React.useState(false);
  const [editingNote, setEditingNote] = React.useState(false);
  const [editingTikTok, setEditingTikTok] = React.useState(false);
  const [editingMetadata, setEditingMetadata] = React.useState(false);
  const [localNote, setLocalNote] = React.useState('');
  const [localTikTokUrl, setLocalTikTokUrl] = React.useState('');
  const [localThumbnailUrl, setLocalThumbnailUrl] = React.useState('');
  const [localViews, setLocalViews] = React.useState('');
  const [localLikes, setLocalLikes] = React.useState('');
  const [localComments, setLocalComments] = React.useState('');
  const [localWatchTime, setLocalWatchTime] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);
  const [isMarkingProduced, setIsMarkingProduced] = React.useState(false);

  // menuPos holds the fixed-position coordinates for the portaled context menu.
  // Computed from the ⋯ button's getBoundingClientRect() when the menu opens.
  const [menuPos, setMenuPos] = React.useState<{ top: number; right: number } | null>(null);

  const slotContainerRef = React.useRef<HTMLDivElement>(null);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const contextMenuRef = React.useRef<HTMLDivElement>(null);

  // Close the portaled context menu when the user clicks outside both the card
  // and the menu itself. We must check both because the portaled menu is rendered
  // at document.body — it is NOT a DOM child of slotContainerRef.
  React.useEffect(() => {
    if (!showContextMenu) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const inCard = slotContainerRef.current?.contains(target) ?? false;
      const inMenu = contextMenuRef.current?.contains(target) ?? false;
      if (!inCard && !inMenu) setShowContextMenu(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showContextMenu]);

  const { concept, type } = slot;
  const sourceConceptId = concept ? getStudioCustomerConceptSourceConceptId(concept) : null;
  const details = sourceConceptId ? getConceptDetails(sourceConceptId) ?? null : null;
  const result = concept?.result ?? null;
  const markers = concept?.markers ?? null;
  const conceptTitle = concept
    ? getStudioCustomerConceptDisplayTitle(
        concept,
        details?.headline_sv?.substring(0, 60) ?? details?.headline ?? null
      )
    : null;
  const isPastSlot = slot.feedOrder < 0;
  const canAddConcept = type === 'empty' && !isPastSlot;
  const hasUnreadUpload = hasUnreadUploadMarker(concept);

  React.useEffect(() => {
    setLocalNote(markers?.assignment_note ?? '');
    setLocalTikTokUrl(result?.tiktok_url ?? '');
    setLocalThumbnailUrl(result?.tiktok_thumbnail_url ?? '');
    setLocalViews(result?.tiktok_views != null ? String(result.tiktok_views) : '');
    setLocalLikes(result?.tiktok_likes != null ? String(result.tiktok_likes) : '');
    setLocalComments(result?.tiktok_comments != null ? String(result.tiktok_comments) : '');
    setLocalWatchTime(
      result?.tiktok_watch_time_seconds != null ? String(result.tiktok_watch_time_seconds) : ''
    );
    setEditingNote(false);
    setEditingTikTok(false);
    setEditingMetadata(false);
    setShowTagPicker(false);
  }, [
    concept?.id,
    markers?.assignment_note,
    result?.tiktok_url,
    result?.tiktok_thumbnail_url,
    result?.tiktok_views,
    result?.tiktok_likes,
    result?.tiktok_comments,
    result?.tiktok_watch_time_seconds,
  ]);

  const formatMetric = (value: number | null) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    return new Intl.NumberFormat('sv-SE', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  };

  const formatDate = (value: string | null) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const parseInputNumber = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('Ange ett icke-negativt tal');
    }
    return Math.round(parsed);
  };

  const requestDateIso = (title: string, currentValue: string | null): string | null | undefined => {
    const currentDate = currentValue ? new Date(currentValue) : null;
    const defaultValue =
      currentDate && !Number.isNaN(currentDate.getTime())
        ? `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(
            currentDate.getDate()
          ).padStart(2, '0')} ${String(currentDate.getHours()).padStart(2, '0')}:${String(
            currentDate.getMinutes()
          ).padStart(2, '0')}`
        : '';
    const value = prompt(`${title} (YYYY-MM-DD HH:mm). Lämna tomt för att rensa.`, defaultValue);
    if (value === null) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const normalized = trimmed.replace(' ', 'T');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Ogiltigt datumformat. Använd YYYY-MM-DD HH:mm');
    }
    return parsed.toISOString();
  };

  const handleToggleTag = async (tagName: string) => {
    if (!concept) return;
    const currentTags = markers?.tags ?? [];
    const nextTags = currentTags.includes(tagName)
      ? currentTags.filter((tag) => tag !== tagName)
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

  const handleSaveTikTokMetadata = async () => {
    if (!concept) return;
    try {
      await onPatchConcept(concept.id, {
        tiktok_thumbnail_url: localThumbnailUrl.trim() || null,
        tiktok_views: parseInputNumber(localViews),
        tiktok_likes: parseInputNumber(localLikes),
        tiktok_comments: parseInputNumber(localComments),
        tiktok_watch_time_seconds: parseInputNumber(localWatchTime),
        tiktok_last_synced_at: new Date().toISOString(),
      });
      setEditingMetadata(false);
    } catch (error) {
      console.error('Error updating TikTok metadata:', error);
      alert(error instanceof Error ? error.message : 'Kunde inte spara TikTok-metadata');
    }
  };

  const handleSetPlannedPublishAt = async () => {
    if (!concept) return;
    try {
      const nextValue = requestDateIso('Planerad publicering', result?.planned_publish_at ?? null);
      if (nextValue === undefined) return;
      await onPatchConcept(concept.id, { planned_publish_at: nextValue });
      setShowContextMenu(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Kunde inte spara planerat datum');
    }
  };

  const handleSetPublishedAt = async () => {
    if (!concept) return;
    try {
      const nextValue = requestDateIso('Publicerad', result?.published_at ?? null);
      if (nextValue === undefined) return;
      await onPatchConcept(concept.id, { published_at: nextValue });
      setShowContextMenu(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Kunde inte spara publicerat datum');
    }
  };

  const handleMarkContentLoadedNow = async () => {
    if (!concept) return;
    try {
      await onPatchConcept(concept.id, {
        content_loaded_at: new Date().toISOString(),
        content_loaded_seen_at: null,
      });
      setShowContextMenu(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Kunde inte markera uppladdning');
    }
  };

  const handleAcknowledgeUpload = async () => {
    if (!concept || !hasUnreadUpload) return;
    try {
      await onPatchConcept(concept.id, {
        content_loaded_seen_at: new Date().toISOString(),
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Kunde inte markera uppladdning som sedd');
    }
  };

  // Compute the fixed position for the portaled menu from the ⋯ button's screen rect.
  // Anchors to the button's right edge so it always appears adjacent to the button,
  // regardless of the card's position in the grid or scroll position.
  const handleMenuToggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!showContextMenu && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      // Position menu below the button, right-aligned to button's right edge.
      // Clamp top so the menu doesn't start above the viewport.
      const top = Math.max(4, rect.bottom + 4);
      const right = window.innerWidth - rect.right;
      setMenuPos({ top, right });
    }
    setShowContextMenu((prev) => !prev);
  };

  const slotStyles = {
    empty: {
      bg: LeTrendColors.cream,
      border: `2px dashed ${LeTrendColors.border}`,
      opacity: 1,
    },
    planned: {
      bg: 'white',
      border: `1px solid ${LeTrendColors.border}`,
      opacity: 1,
    },
    current: {
      bg: 'rgba(107, 68, 35, 0.05)',
      border: `2px solid ${LeTrendColors.brownDark}`,
      opacity: 1,
    },
    // History cards intentionally do NOT use opacity < 1.
    // opacity < 1 on a positioned element creates a CSS stacking context, which traps
    // the portaled context menu inside the card's paint layer — making the menu appear
    // behind sibling grid cells. The visual dimming is instead achieved via a slightly
    // muted background color (equivalent to #F0EDE8 @ 0.85 on white).
    history: {
      bg: '#F2F0EB',
      border: `1px solid ${LeTrendColors.border}`,
      opacity: 1,
    },
  };

  const style = slotStyles[type];
  const isSpanSelected = spanCoverage >= 1;
  const spanTint = isSpanSelected && spanColor && showSpanCoverageLabels ? hexToRgba(spanColor, 0.12) : null;
  const spanOutline =
    isSpanSelected && spanColor && showSpanCoverageLabels
      ? `inset 0 0 0 2px ${hexToRgba(spanColor, 0.5)}`
      : undefined;
  const showSpanCoveragePill = Boolean(showSpanCoverageLabels && isSpanSelected && spanColor);

  const emptyBaseColor = canAddConcept ? style.bg : '#ECE7DF';
  const emptyBackgroundColor = dragOver ? 'rgba(107, 68, 35, 0.08)' : emptyBaseColor;
  const emptyBackgroundImage = !dragOver && spanTint ? `linear-gradient(${spanTint}, ${spanTint})` : 'none';

  if (type === 'empty') {
    return (
      <div
        data-slot-index={slot.slotIndex}
        onClick={() => {
          onSlotClick(slot, null, null);
        }}
        onDragOver={(event) => {
          if (canAddConcept) {
            event.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const conceptId = event.dataTransfer.getData('text/concept-id');
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
            : canAddConcept
              ? style.border
              : `1px solid ${LeTrendColors.border}`,
          borderRadius: LeTrendRadius.lg,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: canAddConcept ? 'pointer' : 'default',
          transition: 'all 0.2s',
          boxShadow: spanOutline,
        }}
        onMouseEnter={(event) => {
          if (canAddConcept) {
            event.currentTarget.style.borderStyle = 'solid';
          }
        }}
        onMouseLeave={(event) => {
          if (canAddConcept) {
            event.currentTarget.style.borderStyle = 'dashed';
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
              pointerEvents: 'none',
            }}
          />
        )}
        {canAddConcept ? (
          <span style={{ fontSize: 32, color: LeTrendColors.textMuted, opacity: 0.5 }}>+</span>
        ) : isPastSlot ? (
          <span style={{ fontSize: 11, color: LeTrendColors.textMuted, opacity: 0.4 }}>tom</span>
        ) : null}
      </div>
    );
  }

  const thumbnailUrl = result?.tiktok_thumbnail_url;
  const hasThumbnail = type === 'history' && thumbnailUrl;
  const slotBackgroundColor = style.bg;
  const slotBackgroundImage = hasThumbnail
    ? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.55)), url(${thumbnailUrl})`
    : spanTint
      ? `linear-gradient(${spanTint}, ${spanTint})`
      : 'none';

  // The context menu is portaled to document.body to escape any ancestor stacking
  // context (CSS grid z-index, eel SVG z-index, etc.). It renders at position:fixed
  // so it's always visible regardless of scroll position or overflow:hidden ancestors.
  const contextMenuPortal = showContextMenu && concept && menuPos && typeof document !== 'undefined'
    ? ReactDOM.createPortal(
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            top: menuPos.top,
            right: menuPos.right,
            background: 'white',
            border: `1px solid ${LeTrendColors.border}`,
            borderRadius: LeTrendRadius.md,
            boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            zIndex: 9999,
            width: 220,
            maxHeight: '70vh',
            overflowY: 'auto',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={(event) => {
              event.stopPropagation();
              onOpenConcept(concept.id, ['script', 'instructions', 'fit']);
              setShowContextMenu(false);
            }}
            style={menuButtonStyle}
          >
            Redigera instruktioner
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation();
              setShowTagPicker((prev) => !prev);
            }}
            style={menuButtonStyle}
          >
            {showTagPicker ? 'Dölj taggar' : 'Hantera taggar'}
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation();
              void handleSetPlannedPublishAt();
            }}
            style={menuButtonStyle}
          >
            Sätt planerad publicering
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation();
              void handleMarkContentLoadedNow();
            }}
            style={menuButtonStyle}
          >
            Markera innehåll uppladdat
          </button>

          {hasUnreadUpload && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                void handleAcknowledgeUpload();
              }}
              style={menuButtonStyle}
            >
              Markera uppladdning sedd
            </button>
          )}

          <button
            onClick={(event) => {
              event.stopPropagation();
              void handleSetPublishedAt();
            }}
            style={menuButtonStyle}
          >
            Sätt publicerat datum
          </button>

          {type === 'history' && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                setEditingNote((prev) => !prev);
              }}
              style={menuButtonStyle}
            >
              {editingNote ? 'Avbryt notering' : 'Redigera notering'}
            </button>
          )}

          {type === 'history' && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                setEditingTikTok((prev) => !prev);
              }}
              style={menuButtonStyle}
            >
              {editingTikTok ? 'Avbryt TikTok-länk' : 'Redigera TikTok-länk'}
            </button>
          )}

          {type === 'history' && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                setEditingMetadata((prev) => !prev);
              }}
              style={menuButtonStyle}
            >
              {editingMetadata ? 'Avbryt metadata' : 'Redigera TikTok-metadata'}
            </button>
          )}

          <button
            onClick={(event) => {
              event.stopPropagation();
              void onRemoveFromSlot(concept.id);
              setShowContextMenu(false);
            }}
            style={{ ...menuButtonStyle, color: '#b91c1c' }}
          >
            Ta bort från flödet
          </button>

          {showTagPicker && (
            <div
              style={{
                borderTop: `1px solid ${LeTrendColors.border}`,
                maxHeight: 180,
                overflowY: 'auto',
              }}
            >
              {tags.length === 0 ? (
                <div style={{ padding: 8, fontSize: 12, color: LeTrendColors.textMuted }}>
                  Inga taggar skapade ännu
                </div>
              ) : (
                tags.map((tag) => {
                  const selected = (markers?.tags ?? []).includes(tag.name);
                  return (
                    <button
                      key={tag.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleToggleTag(tag.name);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: 'none',
                        background: selected ? 'rgba(74, 47, 24, 0.08)' : 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: tag.color,
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1, textAlign: 'left' }}>{tag.name}</span>
                      <span style={{ opacity: selected ? 1 : 0.25 }}>✓</span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {editingNote && type === 'history' && (
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, padding: 8 }}>
              <textarea
                value={localNote}
                onChange={(event) => setLocalNote(event.target.value)}
                rows={3}
                placeholder="Intern notering..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.sm,
                  padding: 6,
                  fontSize: 12,
                  resize: 'vertical',
                }}
              />
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  void handleSaveNote();
                }}
                style={contextSaveButtonStyle}
              >
                Spara notering
              </button>
            </div>
          )}

          {editingTikTok && type === 'history' && (
            <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, padding: 8 }}>
              <input
                value={localTikTokUrl}
                onChange={(event) => setLocalTikTokUrl(event.target.value)}
                placeholder="https://www.tiktok.com/..."
                style={contextInputStyle}
              />
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  void handleSaveTikTok();
                }}
                style={contextSaveButtonStyle}
              >
                Spara TikTok-länk
              </button>
            </div>
          )}

          {editingMetadata && type === 'history' && (
            <div
              style={{
                borderTop: `1px solid ${LeTrendColors.border}`,
                padding: 8,
                display: 'grid',
                gap: 6,
              }}
            >
              <input value={localThumbnailUrl} onChange={(event) => setLocalThumbnailUrl(event.target.value)} placeholder="Thumbnail URL" style={contextInputStyle} />
              <input value={localViews} onChange={(event) => setLocalViews(event.target.value)} placeholder="Visningar" style={contextInputStyle} />
              <input value={localLikes} onChange={(event) => setLocalLikes(event.target.value)} placeholder="Likes" style={contextInputStyle} />
              <input value={localComments} onChange={(event) => setLocalComments(event.target.value)} placeholder="Kommentarer" style={contextInputStyle} />
              <input value={localWatchTime} onChange={(event) => setLocalWatchTime(event.target.value)} placeholder="Watch time (sek)" style={contextInputStyle} />
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  void handleSaveTikTokMetadata();
                }}
                style={contextSaveButtonStyle}
              >
                Spara metadata
              </button>
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div
        ref={slotContainerRef}
        data-slot-index={slot.slotIndex}
        style={{
          aspectRatio: '9/16',
          maxHeight: 280,
          backgroundColor: slotBackgroundColor,
          backgroundImage: slotBackgroundImage,
          backgroundSize: hasThumbnail ? 'cover' : 'auto',
          backgroundPosition: hasThumbnail ? 'center' : '0% 0%',
          backgroundRepeat: hasThumbnail ? 'no-repeat' : 'repeat',
          border: style.border,
          borderRadius: LeTrendRadius.lg,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          opacity: style.opacity,
          // planned cards navigate to the concept editor on click — pointer is correct.
          // current and history card clicks are no-ops; their actions live inside the card.
          cursor: type === 'planned' ? 'pointer' : 'default',
          boxShadow: spanOutline,
        }}
        onClick={() => onSlotClick(slot, concept, details)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {showSpanCoveragePill && (
          <div
            style={{
              position: 'absolute',
              top: type === 'current' ? 32 : 8,
              left: 8,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: spanColor || LeTrendColors.textMuted,
              boxShadow: `0 0 0 2px ${hexToRgba(spanColor || '#999', 0.3)}`,
              pointerEvents: 'none',
            }}
          />
        )}

        {type === 'current' && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              background: LeTrendColors.brownDark,
              color: 'white',
              padding: '2px 8px',
              borderRadius: LeTrendRadius.sm,
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            NU
          </div>
        )}

        {type === 'history' && concept?.row_kind === 'imported_history' && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              background: hasThumbnail ? 'rgba(0,0,0,0.45)' : 'rgba(219,234,254,0.85)',
              color: hasThumbnail ? '#bfdbfe' : '#1d4ed8',
              border: hasThumbnail ? '1px solid rgba(191,219,254,0.25)' : '1px solid #bfdbfe',
              padding: '2px 7px',
              borderRadius: LeTrendRadius.sm,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.03em',
            }}
          >
            Importerad
          </div>
        )}

        {result?.content_loaded_at && (
          <div
            style={{
              position: 'absolute',
              top: type === 'current' ? 8 : 26,
              left: type === 'current' ? 44 : 8,
              background: hasUnreadUpload ? 'rgba(16, 185, 129, 0.14)' : 'rgba(107,114,128,0.12)',
              color: hasUnreadUpload ? '#047857' : '#4b5563',
              padding: '2px 8px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              border: hasUnreadUpload
                ? '1px solid rgba(16, 185, 129, 0.45)'
                : '1px solid rgba(107,114,128,0.25)',
            }}
            title={hasUnreadUpload ? 'Ny uppladdning' : 'Uppladdning sedd'}
          >
            {hasUnreadUpload ? 'Ny uppladdning' : 'Uppladdning sedd'}
          </div>
        )}

        {concept && (isHovered || showContextMenu) && (
          <button
            ref={menuButtonRef}
            onClick={handleMenuToggle}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: showContextMenu
                ? 'rgba(107,68,35,0.1)'
                : 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              color: LeTrendColors.textMuted,
              borderRadius: 4,
              padding: '0 2px',
              lineHeight: 1,
            }}
          >
            ⋯
          </button>
        )}

        {type === 'planned' && concept && isHovered && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              fontSize: 9,
              color: LeTrendColors.textMuted,
              opacity: 0.65,
              pointerEvents: 'none',
              letterSpacing: '0.02em',
            }}
          >
            Öppna →
          </div>
        )}

        {type === 'history' && result?.published_at && (
          <div
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              fontSize: 10,
              color: hasThumbnail ? 'rgba(255,255,255,0.7)' : LeTrendColors.textMuted,
              pointerEvents: 'none',
            }}
          >
            {formatDate(result.published_at)}
          </div>
        )}

        {type === 'history' && result?.tiktok_url && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: 16,
              color: LeTrendColors.brownDark,
              opacity: 0.55,
              pointerEvents: 'none',
            }}
          >
            ▶
          </div>
        )}

        {concept && (
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: hasThumbnail ? 'white' : LeTrendColors.brownDark,
                lineHeight: 1.3,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textShadow: hasThumbnail ? '0 1px 3px rgba(0,0,0,0.5)' : undefined,
              }}
            >
              {conceptTitle}
            </div>

            {result?.planned_publish_at && (
              <div style={{ marginTop: 4, fontSize: 10, color: LeTrendColors.textMuted, lineHeight: 1.3 }}>
                {`Plan: ${formatDate(result.planned_publish_at)}`}
              </div>
            )}

            {type === 'history' && (result?.tiktok_views || result?.tiktok_likes || result?.tiktok_comments) && (
              <div style={{ marginTop: 6, fontSize: 10, color: LeTrendColors.textSecondary }}>
                {`Visn ${formatMetric(result?.tiktok_views ?? null)} · Likes ${formatMetric(
                  result?.tiktok_likes ?? null
                )} · Komm ${formatMetric(result?.tiktok_comments ?? null)}`}
              </div>
            )}
          </div>
        )}

        {concept && markers && markers.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
            {markers.tags.slice(0, 3).map((tagName) => {
              const tag = tags.find((item) => item.name === tagName);
              return tag ? (
                <div
                  key={tagName}
                  title={tagName}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: tag.color,
                    opacity: type === 'history' ? 0.6 : 1,
                  }}
                />
              ) : null;
            })}
          </div>
        )}

        {type === 'current' && concept && (
          <button
            disabled={isMarkingProduced}
            onClick={async (event) => {
              event.stopPropagation();
              const url = prompt('TikTok-länk (valfritt):');
              setIsMarkingProduced(true);
              try {
                await onMarkProduced(concept.id, url || undefined);
              } finally {
                setIsMarkingProduced(false);
              }
            }}
            style={{
              marginTop: 8,
              padding: '6px',
              background: isMarkingProduced ? '#6b9f6b' : LeTrendColors.success,
              border: 'none',
              color: 'white',
              borderRadius: LeTrendRadius.sm,
              fontSize: 11,
              fontWeight: 600,
              cursor: isMarkingProduced ? 'default' : 'pointer',
              width: '100%',
              opacity: isMarkingProduced ? 0.75 : 1,
            }}
          >
            {isMarkingProduced ? 'Markerar...' : '✓ Markera producerat'}
          </button>
        )}
      </div>

      {/* Context menu rendered at document.body via portal so it escapes all
          ancestor stacking contexts (grid z-index, eel SVG, opacity layers). */}
      {contextMenuPortal}
    </>
  );
}

const menuButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 12,
  color: '#1a1a2e',
};

const contextInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: `1px solid #d1cdc7`,
  borderRadius: 4,
  padding: 6,
  fontSize: 12,
};

const contextSaveButtonStyle: React.CSSProperties = {
  marginTop: 8,
  width: '100%',
  padding: 6,
  border: 'none',
  borderRadius: 4,
  background: '#6b4423',
  color: 'white',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
