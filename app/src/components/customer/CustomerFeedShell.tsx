'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getPrimaryRouteForRole, resolveAppRole } from '@/lib/auth/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/shared/Logo';
import { GamePlanDisplay } from '@/components/gameplan-editor/GamePlanDisplay';
import { CustomerNotesSection } from '@/components/customer/CustomerNotesSection';
import { splitCustomerFeedSlots } from '@/lib/customer-feed';
import {
  CUSTOMER_FEED_STATUS_STYLES,
  getCustomerOriginalReferenceLabel,
} from '@/lib/customer-feed-presentation';
import type { CustomerFeedResponse, CustomerFeedSlot } from '@/types/customer-feed';
import type { CustomerNoteItem, CustomerNotesResponse } from '@/types/customer-notes';

interface CustomerBrief {
  tone?: string;
  constraints?: string;
  current_focus?: string;
}

interface CustomerGamePlanPayload {
  business_name: string | null;
  brief: CustomerBrief | null;
  game_plan_html: string;
  has_game_plan: boolean;
}

const headerAnchorStyle = {
  padding: '10px 14px',
  borderRadius: 12,
  textDecoration: 'none',
  color: '#4A2F18',
  border: '1px solid rgba(74, 47, 24, 0.12)',
  fontSize: 14,
  fontWeight: 600,
} as const;

export function CustomerFeedShell() {
  const router = useRouter();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const role = profile ? resolveAppRole(profile) : null;
  const [slots, setSlots] = useState<CustomerFeedSlot[]>([]);
  const [gamePlan, setGamePlan] = useState<CustomerGamePlanPayload | null>(null);
  const [notes, setNotes] = useState<CustomerNoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [gamePlanError, setGamePlanError] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (role && role !== 'customer') {
      router.replace(getPrimaryRouteForRole(profile, { fallback: '/feed' }));
    }
  }, [authLoading, profile, role, router, user]);

  useEffect(() => {
    if (!user || authLoading || role !== 'customer') return;

    let cancelled = false;

    const loadShellData = async () => {
      setLoading(true);
      setFeedError(null);
      setGamePlanError(null);
      setNotesError(null);

      const [feedResult, gamePlanResult, notesResult] = await Promise.allSettled([
        fetch('/api/customer/feed', { cache: 'no-store' }),
        fetch('/api/customer/game-plan', { cache: 'no-store' }),
        fetch('/api/customer/notes?limit=8', { cache: 'no-store' }),
      ]);

      if (cancelled) return;

      if (feedResult.status === 'fulfilled') {
        try {
          const response = feedResult.value;
          const data = await response.json() as CustomerFeedResponse;
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          setSlots(Array.isArray(data.slots) ? data.slots : []);
        } catch {
          setFeedError('Vi kunde inte ladda din plan just nu. Försök igen om en stund.');
          setSlots([]);
        }
      } else {
        setFeedError('Vi kunde inte ladda din plan just nu. Försök igen om en stund.');
        setSlots([]);
      }

      if (gamePlanResult.status === 'fulfilled') {
        try {
          const response = gamePlanResult.value;
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
          setGamePlan(data as CustomerGamePlanPayload);
        } catch {
          setGamePlanError('Game Plan kunde inte hämtas just nu.');
          setGamePlan(null);
        }
      } else {
        setGamePlanError('Game Plan kunde inte hämtas just nu.');
        setGamePlan(null);
      }

      if (notesResult.status === 'fulfilled') {
        try {
          const response = notesResult.value;
          const data = await response.json() as CustomerNotesResponse;
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          setNotes(Array.isArray(data.notes) ? data.notes : []);
        } catch {
          setNotesError('Notes kunde inte hämtas just nu.');
          setNotes([]);
        }
      } else {
        setNotesError('Notes kunde inte hämtas just nu.');
        setNotes([]);
      }

      setLoading(false);
    };

    void loadShellData();

    return () => {
      cancelled = true;
    };
  }, [authLoading, role, user]);

  const groups = useMemo(() => splitCustomerFeedSlots(slots), [slots]);

  const businessName = gamePlan?.business_name || profile?.business_name || 'Din plan';
  const businessInitial = businessName.charAt(0).toUpperCase() || 'L';

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  if (authLoading || (role === 'customer' && loading)) {
    return (
      <ShellFrame>
        <CenteredState
          title="Laddar din plan"
          description="Vi hämtar ditt aktuella feedläge, din game plan och dina senaste notes."
        />
      </ShellFrame>
    );
  }

  return (
    <ShellFrame>
      <header
        style={{
          borderBottom: '1px solid rgba(74, 47, 24, 0.08)',
          background: '#FAF8F5',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            padding: '18px 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Logo size={34} />
            <div>
              <div style={{ fontSize: 12, color: '#8E7E6B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Kundyta
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#1A1612' }}>{businessName}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <a href="#game-plan" style={headerAnchorStyle}>Game Plan</a>
            <a href="#notes" style={headerAnchorStyle}>Notes</a>
            <Link href="/billing" style={headerAnchorStyle}>Fakturering</Link>
            <button
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 14px',
                borderRadius: 12,
                border: '1px solid rgba(74, 47, 24, 0.12)',
                background: '#FFFFFF',
                cursor: 'pointer',
                color: '#4A2F18',
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: '#E8E2D9',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {businessInitial}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Logga ut</span>
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px' }}>
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.65fr) minmax(320px, 0.95fr)',
            gap: 24,
            alignItems: 'start',
          }}
        >
          <div style={{ minWidth: 0, display: 'grid', gap: 24 }}>
            <HeroSummary
              currentSlot={groups.current}
              upcomingCount={groups.upcoming.length}
              historyCount={groups.history.length}
              hasFeedError={Boolean(feedError)}
            />

            {feedError ? (
              <MessageCard title="Kunde inte ladda din feed" description={feedError} tone="error" />
            ) : slots.length === 0 ? (
              <MessageCard
                title="Ingen plan ännu"
                description="Din content manager håller på att sätta nästa steg. När planen är redo ser du den här."
              />
            ) : (
              <div style={{ display: 'grid', gap: 22 }}>
                {groups.current && (
                  <section>
                    <SectionHeading
                      eyebrow="Nu"
                      title="Det som ligger först i din plan"
                      subtitle="Detta är det tydligaste nästa steget just nu."
                    />
                    <DesktopSlotCard slot={groups.current} highlight />
                  </section>
                )}

                {groups.upcoming.length > 0 && (
                  <section>
                    <SectionHeading
                      eyebrow="Kommande"
                      title="Nästa steg i din plan"
                      subtitle="Kuraterade koncept som redan ligger inne i planner-flödet."
                    />
                    <div style={{ display: 'grid', gap: 14 }}>
                      {groups.upcoming.map((slot) => (
                        <DesktopSlotCard key={slot.customerConceptId} slot={slot} />
                      ))}
                    </div>
                  </section>
                )}

                {groups.history.length > 0 && (
                  <section>
                    <SectionHeading
                      eyebrow="Historik"
                      title="Tidigare levererat eller publicerat"
                      subtitle="Används som referens när CM planerar nästa drag."
                    />
                    <div style={{ display: 'grid', gap: 14 }}>
                      {groups.history.map((slot) => (
                        <DesktopSlotCard key={slot.customerConceptId} slot={slot} dimmed />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            <CustomerNotesSection notes={notes} error={notesError} variant="desktop" />
          </div>

          <aside id="game-plan" style={{ minWidth: 0 }}>
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 24,
                border: '1px solid rgba(74, 47, 24, 0.08)',
                padding: 24,
                position: 'sticky',
                top: 104,
                display: 'grid',
                gap: 18,
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: '#8E7E6B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Game Plan
                </div>
                <h2 style={{ fontSize: 24, lineHeight: 1.2, fontWeight: 700, color: '#1A1612', margin: 0 }}>
                  Strategi nära till hands
                </h2>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: '#6B5D4D', margin: '10px 0 0' }}>
                  Detta är den read-only version av planen som din content manager arbetar utifrån just nu.
                </p>
              </div>

              {gamePlan?.brief && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <BriefItem label="Ton" value={gamePlan.brief.tone} />
                  <BriefItem label="Nuvarande fokus" value={gamePlan.brief.current_focus} />
                  <BriefItem label="Ramar" value={gamePlan.brief.constraints} />
                </div>
              )}

              {gamePlanError ? (
                <MessageCard title="Kunde inte ladda Game Plan" description={gamePlanError} tone="error" compact />
              ) : gamePlan?.has_game_plan ? (
                <div
                  style={{
                    padding: 18,
                    borderRadius: 18,
                    background: '#FBFAF7',
                    border: '1px solid rgba(74, 47, 24, 0.08)',
                  }}
                >
                  <GamePlanDisplay html={gamePlan.game_plan_html} />
                </div>
              ) : (
                <MessageCard
                  title="Ingen Game Plan än"
                  description="När din CM har fyllt på strategin syns den här. Tills dess är feeden din sannaste överblick."
                  compact
                />
              )}
            </div>
          </aside>
        </section>
      </main>
    </ShellFrame>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, rgba(232, 226, 217, 0.9), transparent 28%), linear-gradient(180deg, #FAF8F5 0%, #F5F1EA 100%)',
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {children}
    </div>
  );
}

function CenteredState({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 34, marginBottom: 14 }}>•</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1A1612', marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: '#6B5D4D' }}>{description}</div>
      </div>
    </div>
  );
}

function HeroSummary({
  currentSlot,
  upcomingCount,
  historyCount,
  hasFeedError,
}: {
  currentSlot: CustomerFeedSlot | null;
  upcomingCount: number;
  historyCount: number;
  hasFeedError: boolean;
}) {
  return (
    <div
      style={{
        background: 'linear-gradient(145deg, #4A2F18, #3D2510)',
        borderRadius: 28,
        padding: 28,
        color: '#FAF8F5',
      }}
    >
      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.72, marginBottom: 8 }}>
        Feed First
      </div>
      <h1 style={{ fontSize: 34, lineHeight: 1.15, fontWeight: 700, margin: 0 }}>
        Din plan börjar i feeden
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.7, margin: '12px 0 20px', color: 'rgba(250, 248, 245, 0.82)', maxWidth: 680 }}>
        Här ser du vad som är aktuellt nu, vad som ligger näst på tur, och vad som redan finns i historiken. Notes fångar löpande CM-uppdateringar utan att blandas ihop med Game Plan.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <MetricPill label="Nu" value={currentSlot ? '1 aktiv slot' : 'Ingen aktiv slot'} />
        <MetricPill label="Kommande" value={`${upcomingCount} planerade`} />
        <MetricPill label="Historik" value={`${historyCount} tidigare`} />
        <MetricPill label="Status" value={hasFeedError ? 'Behöver laddas om' : 'Synkad med CM'} />
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 16,
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        minWidth: 148,
      }}
    >
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: '#8E7E6B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        {eyebrow}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1A1612', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: '#6B5D4D' }}>{subtitle}</div>
    </div>
  );
}

function DesktopSlotCard({
  slot,
  highlight = false,
  dimmed = false,
}: {
  slot: CustomerFeedSlot;
  highlight?: boolean;
  dimmed?: boolean;
}) {
  const router = useRouter();
  const statusStyle = CUSTOMER_FEED_STATUS_STYLES[slot.status];
  const title = slot.title || (
    slot.bucket === 'history'
      ? (slot.publishedAt || slot.tiktokUrl ? 'Publicerad video' : 'Producerad video')
      : 'Koncept'
  );

  const handleOpenConcept = () => {
    router.push(`/concept/${slot.assignmentId}`);
  };

  const primaryAction = slot.tiktokUrl
    ? { label: 'Se publicerad video', href: slot.tiktokUrl }
    : slot.assignmentId
      ? { label: 'Öppna koncept', onClick: handleOpenConcept }
      : slot.sourceUrl
        ? { label: 'Se referens', href: slot.sourceUrl }
        : null;

  return (
    <div
      style={{
        background: highlight ? 'linear-gradient(180deg, #FFF5E8 0%, #FFFFFF 100%)' : '#FFFFFF',
        borderRadius: 22,
        padding: 22,
        border: highlight ? '1px solid rgba(196, 132, 252, 0.35)' : '1px solid rgba(74, 47, 24, 0.08)',
        boxShadow: highlight ? '0 10px 30px rgba(120, 86, 45, 0.08)' : '0 3px 12px rgba(26, 22, 18, 0.04)',
        opacity: dimmed ? 0.78 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span
              style={{
                background: statusStyle.bg,
                color: statusStyle.text,
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {slot.statusLabel}
            </span>
            {typeof slot.matchPercentage === 'number' && (
              <span
                style={{
                  background: '#F6F2EB',
                  color: '#5B4B3C',
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {slot.matchPercentage}% match
              </span>
            )}
          </div>

          <div style={{ fontSize: 20, lineHeight: 1.3, fontWeight: 700, color: '#1A1612', marginBottom: 8 }}>{title}</div>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: '#6B5D4D', margin: 0 }}>{slot.summary}</p>
        </div>
      </div>

      {slot.detailHint && (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: '#7C3AED', margin: '0 0 12px' }}>
          {slot.detailHint}
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, color: '#8E7E6B', marginTop: 14 }}>
        <Chip>{getDateLabel(slot)}</Chip>
        {slot.sourceUrl && !slot.tiktokUrl && <Chip>{getCustomerOriginalReferenceLabel()}</Chip>}
        {slot.productionNotes.length > 0 && <Chip>{slot.productionNotes.length} inspelningspunkter</Chip>}
      </div>

      {slot.note && (
        <div
          style={{
            marginTop: 16,
            background: '#FFF7E9',
            borderRadius: 16,
            padding: '14px 16px',
            border: '1px solid rgba(217, 119, 6, 0.12)',
          }}
        >
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: '#A16207', marginBottom: 6 }}>
            Notering från CM
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: '#854D0E' }}>{slot.note}</div>
        </div>
      )}

      {primaryAction && (
        <div style={{ marginTop: 16 }}>
          {'href' in primaryAction ? (
            <a
              href={primaryAction.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: '#4F46E5',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 700,
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
                background: '#4F46E5',
                color: '#FFFFFF',
                borderRadius: 999,
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
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

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '6px 10px',
        borderRadius: 999,
        background: '#F6F2EB',
      }}
    >
      {children}
    </span>
  );
}

function BriefItem({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;

  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 16,
        background: '#F7F2EC',
        border: '1px solid rgba(74, 47, 24, 0.06)',
      }}
    >
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8E7E6B', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: '#3C3127' }}>{value}</div>
    </div>
  );
}

function MessageCard({
  title,
  description,
  tone = 'neutral',
  compact = false,
}: {
  title: string;
  description: string;
  tone?: 'neutral' | 'error';
  compact?: boolean;
}) {
  const palette = tone === 'error'
    ? { background: '#FEEFEF', border: 'rgba(185, 28, 28, 0.14)', title: '#991B1B', text: '#7F1D1D' }
    : { background: '#FFFFFF', border: 'rgba(74, 47, 24, 0.08)', title: '#1A1612', text: '#6B5D4D' };

  return (
    <div
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: compact ? 18 : 24,
        padding: compact ? 16 : 24,
      }}
    >
      <div style={{ fontSize: compact ? 16 : 20, fontWeight: 700, color: palette.title, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: palette.text }}>{description}</div>
    </div>
  );
}

function getDateLabel(slot: CustomerFeedSlot): string {
  if (slot.publishedAt) return `Publicerad ${formatDate(slot.publishedAt)}`;
  if (slot.producedAt) return `Producerad ${formatDate(slot.producedAt)}`;
  if (slot.sharedAt) return `Delad ${formatDate(slot.sharedAt)}`;
  if (slot.bucket === 'current') return 'Nu i din plan';
  if (slot.bucket === 'upcoming') return 'Kommande i din plan';
  return 'Tidigare i din plan';
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('sv-SE');
}
