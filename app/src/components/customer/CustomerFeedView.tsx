'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CustomerNotesSection } from '@/components/customer/CustomerNotesSection';
import { useAuth } from '@/contexts/AuthContext';
import { splitCustomerFeedSlots } from '@/lib/customer-feed';
import { CustomerPlannerGrid } from '@/components/customer/CustomerPlannerGrid';
import {
  CUSTOMER_FEED_STATUS_STYLES,
  getCustomerOriginalReferenceLabel,
} from '@/lib/customer-feed-presentation';
import { colors, fontFamily, pageContainer, scrollContainer, sectionLabel } from '@/styles/mobile-design';
import type { CustomerFeedResponse, CustomerFeedSlot } from '@/types/customer-feed';
import type { CustomerNoteItem, CustomerNotesResponse } from '@/types/customer-notes';

type CustomerFeedViewProps = {
  variant: 'mobile' | 'desktop';
};

export function CustomerFeedView({ variant }: CustomerFeedViewProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [slots, setSlots] = useState<CustomerFeedSlot[]>([]);
  const [notes, setNotes] = useState<CustomerNoteItem[]>([]);
  const [currentFocus, setCurrentFocus] = useState<string | null>(null);
  const [cmName, setCmName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(variant === 'mobile' ? '/m/login' : '/login');
    }
  }, [authLoading, router, user, variant]);

  useEffect(() => {
    if (!user) return;

    const controller = new AbortController();

    const loadFeed = async () => {
      setLoading(true);
      setError(null);
      setNotesError(null);

      const [feedResult, notesResult, gamePlanResult] = await Promise.allSettled([
        fetch('/api/customer/feed', {
          signal: controller.signal,
          cache: 'no-store',
        }),
        fetch('/api/customer/notes?limit=6', {
          signal: controller.signal,
          cache: 'no-store',
        }),
        fetch('/api/customer/game-plan', {
          signal: controller.signal,
          cache: 'no-store',
        }),
      ]);

      if (feedResult.status === 'fulfilled') {
        try {
          const response = feedResult.value;
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json() as CustomerFeedResponse;
          setSlots(Array.isArray(data.slots) ? data.slots : []);
        } catch (fetchError) {
          if ((fetchError as Error).name !== 'AbortError') {
            setError('Vi kunde inte ladda din plan just nu. Försök igen om en stund.');
            setSlots([]);
          }
        }
      } else if ((feedResult.reason as Error)?.name !== 'AbortError') {
        setError('Vi kunde inte ladda din plan just nu. Försök igen om en stund.');
        setSlots([]);
      }

      if (notesResult.status === 'fulfilled') {
        try {
          const response = notesResult.value;
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const notesData = await response.json() as CustomerNotesResponse;
          setNotes(Array.isArray(notesData.notes) ? notesData.notes : []);
        } catch (fetchError) {
          if ((fetchError as Error).name !== 'AbortError') {
            setNotesError('Notes kunde inte laddas just nu.');
            setNotes([]);
          }
        }
      } else if ((notesResult.reason as Error)?.name !== 'AbortError') {
        setNotesError('Notes kunde inte laddas just nu.');
        setNotes([]);
      }

      if (gamePlanResult.status === 'fulfilled') {
        try {
          const response = gamePlanResult.value;
          if (response.ok) {
            const gpData = await response.json() as { brief?: { current_focus?: string } | null; cm_name?: string | null };
            const focus = gpData?.brief?.current_focus?.trim() ?? null;
            setCurrentFocus(focus || null);
            setCmName(gpData?.cm_name?.trim() || null);
          }
        } catch {
          // Non-critical — editorial intro simply won't render
        }
      }

      setLoading(false);
    };

    void loadFeed();

    return () => controller.abort();
  }, [user]);

  const groups = useMemo(() => splitCustomerFeedSlots(slots), [slots]);

  if (authLoading || loading) {
    return variant === 'mobile' ? <MobileLoadingState /> : <DesktopLoadingState />;
  }

  const content = (
    <>
      {currentFocus && <EditorialIntroCard text={currentFocus} variant={variant} cmName={cmName} />}

      {error && <FeedMessageCard tone="error" message={error} />}

      {!error && slots.length === 0 && (
        <FeedMessageCard
          tone="neutral"
          title="Ingen plan ännu"
          message="Din content manager håller på att sätta nästa steg. När planen är redo ser du den här."
        />
      )}

      {!error && slots.length > 0 && (
        <>
          {variant === 'mobile' ? (
            <p style={sectionLabel}>PLAN</p>
          ) : (
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Plan
            </h2>
          )}
          <CustomerPlannerGrid slots={slots} variant={variant} />

          {groups.current && (
            <FeedSection
              variant={variant}
              title={variant === 'mobile' ? 'JUST NU' : 'Just nu'}
              slots={[groups.current]}
              highlightCurrent
              cmName={cmName}
            />
          )}

          {groups.upcoming.length > 0 && (
            <FeedSection
              variant={variant}
              title={variant === 'mobile' ? 'KOMMANDE' : 'Kommande'}
              slots={groups.upcoming}
              cmName={cmName}
            />
          )}

          {groups.history.length > 0 && (
            <FeedSection
              variant={variant}
              title={variant === 'mobile' ? 'TIDIGARE' : 'Tidigare'}
              slots={groups.history}
              dimHistory
              cmName={cmName}
            />
          )}
        </>
      )}

      <CustomerNotesSection notes={notes} error={notesError} variant={variant} />
    </>
  );

  if (variant === 'mobile') {
    return (
      <div style={{ ...pageContainer, background: colors.bg }}>
        <div style={scrollContainer}>
          <div style={{
            padding: '18px 20px 14px',
            background: colors.card,
            borderBottom: `1px solid ${colors.muted}`,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.text, fontFamily }}>LeTrend</div>
            <div style={{ marginTop: 4, fontSize: 22, fontWeight: 600, color: colors.text, fontFamily }}>Min plan</div>
            <div style={{ marginTop: 6, fontSize: 13, color: colors.textMuted, lineHeight: 1.5, fontFamily }}>
              Din aktuella plan med nästa steg, kommande innehåll och löpande notes från din CM.
            </div>
          </div>

          <div style={{ padding: '24px 20px 32px' }}>
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '920px', margin: '0 auto', padding: '40px 24px 56px' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 10 }}>LeTrend</div>
        <h1 style={{ fontSize: '30px', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Min plan</h1>
        <p style={{ color: '#6b7280', marginTop: 8, fontSize: 15, lineHeight: 1.6 }}>
          Här ser du vad som är aktuellt nu, vad som kommer härnäst och vilka löpande notes din content manager lämnat.
        </p>
      </div>

      {content}
    </div>
  );
}

function FeedSection({
  variant,
  title,
  slots,
  highlightCurrent = false,
  dimHistory = false,
  cmName = null,
}: {
  variant: 'mobile' | 'desktop';
  title: string;
  slots: CustomerFeedSlot[];
  highlightCurrent?: boolean;
  dimHistory?: boolean;
  cmName?: string | null;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      {variant === 'mobile' ? (
        <p style={sectionLabel}>{title}</p>
      ) : (
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </h2>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {slots.map((slot) => (
          <FeedSlotCard
            key={slot.assignmentId}
            slot={slot}
            variant={variant}
            highlight={highlightCurrent}
            dimmed={dimHistory}
            cmName={cmName}
          />
        ))}
      </div>
    </div>
  );
}

function FeedSlotCard({
  slot,
  variant,
  highlight = false,
  dimmed = false,
  cmName = null,
}: {
  slot: CustomerFeedSlot;
  variant: 'mobile' | 'desktop';
  highlight?: boolean;
  dimmed?: boolean;
  cmName?: string | null;
}) {
  const router = useRouter();
  const statusStyle = CUSTOMER_FEED_STATUS_STYLES[slot.status];
  const isMobile = variant === 'mobile';
  const isImportedHistory = slot.rowKind === 'imported_history';
  const background = highlight
    ? (isMobile ? '#fdf4ff' : '#faf5ff')
    : isImportedHistory
      ? (isMobile ? '#f8f8f8' : '#f9fafb')
      : isMobile ? colors.card : '#fff';
  const borderColor = highlight ? (isMobile ? '#c084fc' : '#8b5cf6') : isMobile ? 'transparent' : '#e5e7eb';

  const handleOpenConcept = () => {
    router.push(`${isMobile ? '/m/concept' : '/concept'}/${slot.assignmentId}`);
  };

  const primaryAction = slot.result.tiktokUrl
    ? { label: isImportedHistory ? 'Se originalet' : 'Se publicerad video', href: slot.result.tiktokUrl }
    : !isImportedHistory && slot.assignmentId
      ? { label: 'Öppna koncept', onClick: handleOpenConcept }
      : slot.sourceUrl
        ? { label: 'Se referens', href: slot.sourceUrl }
        : null;

  return (
    <div style={{
      background,
      borderRadius: isMobile ? 16 : 12,
      padding: isMobile ? 18 : 20,
      boxShadow: highlight
        ? (isMobile ? '0 0 0 2px #c084fc, 0 4px 12px rgba(0,0,0,0.06)' : '0 0 0 2px #8b5cf6, 0 4px 12px rgba(0,0,0,0.08)')
        : '0 1px 3px rgba(0,0,0,0.08)',
      border: `1px solid ${borderColor}`,
      opacity: dimmed ? 0.74 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {isImportedHistory ? (
              <span style={{
                background: '#f1f5f9',
                color: '#64748b',
                padding: isMobile ? '2px 8px' : '3px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
              }}>
                TikTok-klipp
              </span>
            ) : (
              <span style={{
                background: statusStyle.bg,
                color: statusStyle.text,
                padding: isMobile ? '2px 8px' : '3px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
              }}>
                {slot.statusLabel}
              </span>
            )}
            {!isImportedHistory && typeof slot.matchPercentage === 'number' && (
              <span style={{
                background: '#f3f4f6',
                color: '#4b5563',
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
              }}>
                {slot.matchPercentage}% passning
              </span>
            )}
          </div>

          <div style={{
            fontSize: isMobile ? 15 : 16,
            fontWeight: 600,
            color: isMobile ? colors.text : '#1a1a2e',
            lineHeight: 1.4,
            fontFamily: isMobile ? fontFamily : undefined,
          }}>
            {slot.title}
          </div>
        </div>
      </div>

      <p style={{
        fontSize: isMobile ? 13 : 14,
        color: isMobile ? colors.textMuted : '#6b7280',
        lineHeight: 1.6,
        margin: '0 0 12px',
        fontFamily: isMobile ? fontFamily : undefined,
      }}>
        {slot.summary}
      </p>

      {isImportedHistory && (slot.result.tiktokViews !== null || slot.result.tiktokLikes !== null || slot.result.publishedAt !== null) && (
        <div style={{
          fontSize: 12,
          color: isMobile ? colors.textSubtle : '#94a3b8',
          margin: '0 0 10px',
          fontFamily: isMobile ? fontFamily : undefined,
        }}>
          {[
            slot.result.publishedAt !== null && formatShortDate(slot.result.publishedAt),
            slot.result.tiktokViews !== null && `${formatCompact(slot.result.tiktokViews)} visningar`,
            slot.result.tiktokLikes !== null && `${formatCompact(slot.result.tiktokLikes)} likes`,
          ].filter(Boolean).join(' · ')}
        </div>
      )}

      {slot.detailHint && (
        <p style={{
          fontSize: 12,
          color: '#7c3aed',
          lineHeight: 1.5,
          margin: '0 0 12px',
          fontFamily: isMobile ? fontFamily : undefined,
        }}>
          {slot.detailHint}
        </p>
      )}

      <div style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        fontSize: 12,
        color: isMobile ? colors.textSubtle : '#9ca3af',
        marginBottom: slot.note || primaryAction ? 12 : 0,
        fontFamily: isMobile ? fontFamily : undefined,
      }}>
        {!isImportedHistory && <span>{getDateLabel(slot)}</span>}
        {slot.sourceUrl && !slot.result.tiktokUrl && <span>{getCustomerOriginalReferenceLabel()}</span>}
        {slot.productionNotes.length > 0 && <span>{slot.productionNotes.length} inspelningspunkter</span>}
      </div>

      {slot.note && (
        <div style={{
          marginTop: 12,
          background: '#fffbeb',
          borderRadius: isMobile ? 10 : 8,
          padding: '10px 12px',
        }}>
          <p style={{
            fontSize: isMobile ? 11 : 12,
            fontWeight: 600,
            color: '#92400e',
            margin: '0 0 2px',
            fontFamily: isMobile ? fontFamily : undefined,
          }}>
            {cmName ? `Notering från ${cmName}` : 'Notering från CM'}
          </p>
          <p style={{
            fontSize: 13,
            color: '#78350f',
            margin: 0,
            lineHeight: 1.5,
            fontFamily: isMobile ? fontFamily : undefined,
          }}>
            {slot.note}
          </p>
        </div>
      )}

      {primaryAction && (
        <div style={{ marginTop: 14 }}>
          {'href' in primaryAction ? (
            <a
              href={primaryAction.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: isMobile ? colors.primary : '#4f46e5',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: isMobile ? fontFamily : undefined,
              }}
            >
              {primaryAction.label}
              <span aria-hidden="true">→</span>
            </a>
          ) : (
            <button
              onClick={primaryAction.onClick}
              style={{
                border: 'none',
                background: isMobile ? colors.primary : '#4f46e5',
                color: '#fff',
                borderRadius: 999,
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: isMobile ? fontFamily : undefined,
              }}
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EditorialIntroCard({ text, variant, cmName = null }: { text: string; variant: 'mobile' | 'desktop'; cmName?: string | null }) {
  const isMobile = variant === 'mobile';
  return (
    <div
      style={{
        background: '#FAF6F0',
        borderRadius: isMobile ? 14 : 16,
        padding: isMobile ? '14px 16px' : '18px 20px',
        marginBottom: 20,
        border: '1px solid rgba(74, 47, 24, 0.08)',
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#8E7E6B',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          margin: '0 0 4px',
          fontFamily: isMobile ? fontFamily : undefined,
        }}
      >
        {cmName ?? 'Den här perioden'}
      </p>
      <p
        style={{
          fontSize: isMobile ? 14 : 15,
          color: '#3C3127',
          lineHeight: 1.6,
          margin: 0,
          fontFamily: isMobile ? fontFamily : undefined,
        }}
      >
        {text}
      </p>
    </div>
  );
}

function FeedMessageCard({
  tone,
  title,
  message,
}: {
  tone: 'neutral' | 'error';
  title?: string;
  message: string;
}) {
  const palette = tone === 'error'
    ? { background: '#fee2e2', title: '#991b1b', text: '#991b1b' }
    : { background: '#f8fafc', title: '#111827', text: '#6b7280' };

  return (
    <div style={{
      background: palette.background,
      borderRadius: 14,
      padding: '16px 18px',
      marginBottom: 20,
    }}>
      {title && (
        <div style={{ fontSize: 16, fontWeight: 600, color: palette.title, marginBottom: 6 }}>
          {title}
        </div>
      )}
      <p style={{ margin: 0, color: palette.text, fontSize: 14, lineHeight: 1.6, fontFamily }}>
        {message}
      </p>
    </div>
  );
}

function MobileLoadingState() {
  return (
    <div style={{ ...pageContainer, background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: colors.textMuted, fontFamily }}>Laddar din plan...</p>
    </div>
  );
}

function DesktopLoadingState() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <p style={{ color: '#6b7280' }}>Laddar din plan...</p>
    </div>
  );
}

function getDateLabel(slot: CustomerFeedSlot): string {
  if (slot.result.publishedAt) return `Publicerad ${formatDate(slot.result.publishedAt)}`;
  if (slot.result.producedAt) return `Producerad ${formatDate(slot.result.producedAt)}`;
  if (slot.result.sharedAt) return `Delad ${formatDate(slot.result.sharedAt)}`;
  if (slot.placement.bucket === 'current') return 'Nu i din plan';
  if (slot.placement.bucket === 'upcoming') return 'Kommande i din plan';
  return 'Tidigare i din plan';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('sv-SE');
}

function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')}k`;
  return String(n);
}
