'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
// Intentional: demo mode uses the static JSON loader (clips-priority.json) for stable,
// auth-free fixture data. Do not replace with conceptLoaderDB — demo state is computed
// synchronously via useMemo and the demo clips are curated fixtures, not DB-ingested concepts.
import { loadConceptById } from '@/lib/conceptLoader';
import type { TranslatedConcept } from '@/lib/translator';
import { useVideoSignedUrl } from '@/hooks/useVideoSignedUrl';
import type { CustomerConceptDetailResponse } from '@/types/customer-concept';

interface CustomerConceptDetailViewProps {
  assignmentId: string;
  variant: 'desktop' | 'mobile';
}

type FetchState =
  | { status: 'loading' }
  | { status: 'ready'; detail: CustomerConceptDetailResponse }
  | { status: 'error'; title: string; description: string };

export function CustomerConceptDetailView({
  assignmentId,
  variant,
}: CustomerConceptDetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDemo = variant === 'mobile' && searchParams.get('demo') === 'true';
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const demoState = useMemo<FetchState | null>(() => {
    if (!isDemo) return null;

    const demoConcept = loadConceptById(assignmentId);

    if (!demoConcept) {
      return {
        status: 'error',
        title: 'Konceptet hittades inte',
        description: 'Det gick inte att hitta demo-konceptet du forsokte oppna.',
      };
    }

    return {
      status: 'ready',
      detail: buildDemoDetailResponse(demoConcept),
    };
  }, [assignmentId, isDemo]);

  useEffect(() => {
    if (isDemo) return;

    let cancelled = false;

    const loadDetail = async () => {
      setState({ status: 'loading' });

      try {
        const response = await fetch(`/api/customer/concepts/${assignmentId}`, {
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (!response.ok) {
          setState({
            status: 'error',
            title: response.status === 404 ? 'Konceptet finns inte i din plan' : 'Kunde inte ladda konceptet',
            description:
              response.status === 404
                ? 'Det har inte langre en aktiv plats i din plan, eller sa ar det inte tilldelat till ditt konto.'
                : 'Forsok igen om en stund eller ga tillbaka till din plan.',
          });
          return;
        }

        setState({
          status: 'ready',
          detail: data as CustomerConceptDetailResponse,
        });
      } catch {
        if (cancelled) return;
        setState({
          status: 'error',
          title: 'Kunde inte ladda konceptet',
          description: 'Det gick inte att hamta konceptdetaljen just nu. Forsok igen om en stund.',
        });
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [assignmentId, isDemo]);

  const activeState = demoState ?? state;
  const detail = activeState.status === 'ready' ? activeState.detail : null;
  const backHref = isDemo ? '/m/legacy-demo' : variant === 'mobile' ? '/m/feed' : '/feed';
  const gcsUri = detail?.media.reference_video_gcs_uri;
  const { signedUrl, isLoading: videoLoading, error: videoError } = useVideoSignedUrl({
    gcsUri: gcsUri ?? undefined,
    enabled: Boolean(gcsUri),
  });

  const layout = useMemo(() => getLayout(variant), [variant]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          variant === 'desktop'
            ? 'radial-gradient(circle at top left, rgba(232, 226, 217, 0.85), transparent 28%), linear-gradient(180deg, #FAF8F5 0%, #F5F1EA 100%)'
            : '#FAF8F5',
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: layout.outerPadding }}>
        <button
          onClick={() => router.push(backHref)}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#6B5D4D',
            cursor: 'pointer',
            fontSize: variant === 'mobile' ? 14 : 15,
            fontWeight: 600,
            padding: 0,
            marginBottom: 20,
          }}
        >
          {variant === 'mobile' ? '← Till plan' : '← Tillbaka till din plan'}
        </button>

        {activeState.status === 'loading' ? (
          <StateCard
            title="Laddar konceptdetaljen"
            description="Vi hamtar den tilldelade konceptversionen fran din plan."
          />
        ) : activeState.status === 'error' ? (
          <StateCard
            title={activeState.title}
            description={activeState.description}
            actionLabel="Ga tillbaka till planen"
            onAction={() => router.push(backHref)}
          />
        ) : detail ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: layout.gridColumns,
              gap: 24,
              alignItems: 'start',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <HeroCard detail={detail} />

              {detail.assignment.cm_note ? (
                <MessageCard
                  title="Notering fran din content manager"
                  description={detail.assignment.cm_note}
                  tone="warm"
                />
              ) : null}

              <SectionCard title="Manus" emptyLabel="Manuset fylls pa av din content manager.">
                {detail.metadata.script}
              </SectionCard>

              <SectionCard title="Varfor det passar er" emptyLabel="Fit-forklaringen ar inte ifylld an.">
                {detail.metadata.why_it_fits}
              </SectionCard>

              <SectionCard title="Filmtips" emptyLabel="Det finns inga specifika filmtips an.">
                {detail.metadata.filming_guidance}
              </SectionCard>

              <ChecklistCard items={detail.metadata.production_checklist} />
            </div>

            <aside style={{ minWidth: 0 }}>
              <MediaCard
                detail={detail}
                signedUrl={signedUrl}
                videoLoading={videoLoading}
                videoError={videoError}
                sticky={variant === 'desktop'}
              />
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HeroCard({ detail }: { detail: CustomerConceptDetailResponse }) {
  const chips = [
    detail.assignment.lifecycle_label,
    detail.placement.placement_label,
    detail.result.result_label,
    ...detail.metadata.tags.slice(0, 4),
  ].filter((value): value is string => Boolean(value));

  return (
    <div
      style={{
        background: 'linear-gradient(145deg, #4A2F18, #3D2510)',
        borderRadius: 28,
        padding: 28,
        color: '#FAF8F5',
        marginBottom: 18,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        {chips.map((chip) => (
          <span
            key={chip}
            style={{
              padding: '7px 11px',
              borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {chip}
          </span>
        ))}
      </div>

      <h1
        style={{
          fontSize: 34,
          lineHeight: 1.1,
          fontWeight: 700,
          margin: 0,
        }}
      >
        {detail.metadata.title}
      </h1>

      <p
        style={{
          margin: '14px 0 0',
          fontSize: 16,
          lineHeight: 1.7,
          color: 'rgba(250, 248, 245, 0.84)',
        }}
      >
        {detail.metadata.summary ?? 'Detta ar den version av konceptet som ar tilldelad i din plan just nu.'}
      </p>
    </div>
  );
}

function MediaCard({
  detail,
  signedUrl,
  videoLoading,
  videoError,
  sticky,
}: {
  detail: CustomerConceptDetailResponse;
  signedUrl: string | null;
  videoLoading: boolean;
  videoError: string | null;
  sticky: boolean;
}) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 24,
        border: '1px solid rgba(74, 47, 24, 0.08)',
        padding: 22,
        display: 'grid',
        gap: 16,
        position: sticky ? 'sticky' : 'static',
        top: sticky ? 96 : undefined,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#8E7E6B',
            marginBottom: 6,
          }}
        >
          Referens
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1A1612' }}>
          Konceptets material
        </div>
      </div>

      <div
        style={{
          width: '100%',
          aspectRatio: '9 / 16',
          borderRadius: 18,
          overflow: 'hidden',
          background: '#1A1612',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FAF8F5',
        }}
      >
        {signedUrl ? (
          <video
            src={signedUrl}
            controls
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : videoLoading ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 14 }}>Laddar referensvideo...</div>
        ) : detail.media.source_reference_url ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 14 }}>
            Ingen intern video sparad for konceptet.
          </div>
        ) : (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 14 }}>
            Ingen videoreferens tillganglig an.
          </div>
        )}
      </div>

      {videoError ? (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 14,
            background: '#FEEFEF',
            border: '1px solid rgba(185, 28, 28, 0.12)',
            color: '#7F1D1D',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {videoError}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {detail.media.source_reference_url ? (
          <ActionLink href={detail.media.source_reference_url} label="Se originalreferens" />
        ) : null}
        {detail.result.tiktok_url ? (
          <ActionLink href={detail.result.tiktok_url} label="Se publicerad video" />
        ) : null}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  emptyLabel,
}: {
  title: string;
  children: string | null;
  emptyLabel: string;
}) {
  const hasContent = Boolean(children?.trim());

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 24,
        border: '1px solid rgba(74, 47, 24, 0.08)',
        padding: 24,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#8E7E6B',
          marginBottom: 10,
        }}
      >
        {title}
      </div>

      {hasContent ? (
        <div
          style={{
            fontSize: 15,
            lineHeight: 1.8,
            color: '#3C3127',
            whiteSpace: 'pre-wrap',
          }}
        >
          {children}
        </div>
      ) : (
        <div style={{ fontSize: 14, lineHeight: 1.7, color: '#8E7E6B' }}>{emptyLabel}</div>
      )}
    </div>
  );
}

function ChecklistCard({ items }: { items: string[] }) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 24,
        border: '1px solid rgba(74, 47, 24, 0.08)',
        padding: 24,
      }}
    >
      <div
        style={{
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#8E7E6B',
          marginBottom: 10,
        }}
      >
        Checklista
      </div>

      {items.length > 0 ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((item, index) => (
            <div
              key={`${item}-${index}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 16,
                background: '#F7F2EC',
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#4A2F18',
                  color: '#FFFFFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  marginTop: 1,
                }}
              >
                {index + 1}
              </span>
              <span style={{ fontSize: 14, lineHeight: 1.7, color: '#3C3127' }}>{item}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 14, lineHeight: 1.7, color: '#8E7E6B' }}>
          Det finns ingen inspelningschecklista an.
        </div>
      )}
    </div>
  );
}

function MessageCard({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: 'warm';
}) {
  const palette =
    tone === 'warm'
      ? {
          background: '#FFF7E9',
          border: 'rgba(217, 119, 6, 0.12)',
          title: '#A16207',
          text: '#854D0E',
        }
      : {
          background: '#FFFFFF',
          border: 'rgba(74, 47, 24, 0.08)',
          title: '#1A1612',
          text: '#6B5D4D',
        };

  return (
    <div
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: 24,
        padding: 24,
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: palette.title, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: palette.text, whiteSpace: 'pre-wrap' }}>{description}</div>
    </div>
  );
}

function StateCard({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 24,
        border: '1px solid rgba(74, 47, 24, 0.08)',
        padding: 28,
        maxWidth: 640,
      }}
    >
      <h1 style={{ fontSize: 28, lineHeight: 1.2, fontWeight: 700, color: '#1A1612', margin: 0 }}>
        {title}
      </h1>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: '#6B5D4D', margin: '12px 0 0' }}>{description}</p>
      {actionLabel && onAction ? (
        <button
          onClick={onAction}
          style={{
            marginTop: 18,
            border: 'none',
            background: '#4F46E5',
            color: '#FFFFFF',
            padding: '12px 16px',
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '12px 14px',
        borderRadius: 14,
        background: '#F6F2EB',
        textDecoration: 'none',
        color: '#4A2F18',
        fontSize: 14,
        fontWeight: 700,
      }}
    >
      {label}
      <span aria-hidden="true">→</span>
    </a>
  );
}

function getLayout(variant: 'desktop' | 'mobile') {
  if (variant === 'mobile') {
    return {
      maxWidth: '720px',
      outerPadding: '20px 16px 32px',
      gridColumns: 'minmax(0, 1fr)',
    };
  }

  return {
    maxWidth: '1200px',
    outerPadding: '28px 32px 48px',
    gridColumns: 'minmax(0, 1.55fr) minmax(320px, 0.9fr)',
  };
}

function buildDemoDetailResponse(concept: TranslatedConcept): CustomerConceptDetailResponse {
  return {
    assignment: {
      id: `demo-${concept.id}`,
      source_concept_id: concept.id,
      concept_id: concept.id,
      status: null,
      lifecycle_label: 'Demo',
      match_percentage: concept.matchPercentage,
      cm_note: null,
      added_at: null,
    },
    placement: {
      feed_order: null,
      bucket: null,
      placement_label: null,
    },
    result: {
      sent_at: null,
      produced_at: null,
      published_at: null,
      tiktok_url: null,
      result_label: null,
    },
    metadata: {
      title: concept.headline_sv || concept.headline,
      summary: concept.description_sv ?? null,
      script: concept.script_sv ?? null,
      why_it_fits:
        concept.whyItFits_sv?.join(' ') ??
        concept.whyItWorks_sv ??
        concept.whyItFits.join(' ') ??
        null,
      filming_guidance: null,
      production_checklist: concept.productionNotes_sv ?? [],
      tags: [],
    },
    media: {
      source_reference_url: concept.sourceUrl ?? null,
      reference_video_gcs_uri: concept.gcsUri ?? null,
    },
  };
}
