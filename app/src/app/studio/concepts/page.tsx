'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { UploadConceptModal } from '@/components/studio/UploadConceptModal';
import { display } from '@/lib/display';
import { supabase } from '@/lib/supabase/client';
import {
  translateClipToConcept,
  type BackendClip,
  type ClipOverride,
  type TranslatedConcept,
} from '@/lib/translator';
import {
  LeTrendColors,
  LeTrendRadius,
  LeTrendShadows,
  LeTrendTypography,
  buttonStyle,
  inputStyle,
} from '@/styles/letrend-design-system';

type ConceptSource = 'hagen' | 'cm_created' | string;
type ConceptLibraryItem = TranslatedConcept & {
  source: ConceptSource;
  created_at: string | null;
  is_active: boolean;
  platform?: string | null;
  tiktokThumbnail?: string | null;
};
type PendingConcept = { id: string; headline: string };

const DIFFICULTY_OPTIONS = [
  { key: 'easy', label: display.difficulty('easy').label },
  { key: 'medium', label: display.difficulty('medium').label },
  { key: 'advanced', label: display.difficulty('advanced').label },
];

const FILM_TIME_RANGE_OPTIONS = [
  { key: 'quick', label: '5-15 min' },
  { key: 'medium', label: '15-30 min' },
  { key: 'long', label: '30 min+' },
];

const PEOPLE_RANGE_OPTIONS = [
  { key: 'solo', label: '1 person' },
  { key: 'small', label: '2-3 personer' },
  { key: 'team', label: '4+ personer' },
];

function detectPlatform(url?: string) {
  const normalized = url?.toLowerCase() ?? '';
  if (normalized.includes('youtube') || normalized.includes('youtu.be')) return 'youtube';
  if (normalized.includes('instagram')) return 'instagram';
  if (normalized.includes('tiktok')) return 'tiktok';
  return null;
}

function getYouTubeThumbnail(url?: string | null) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|v=)([\w-]+)/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
}

function getSourceBadge(source: ConceptSource) {
  if (source === 'hagen') return { label: 'LeT', useLogo: true };
  return { label: 'CM', useLogo: false };
}

function matchFilmTimeRange(filmTime: string | undefined, filter: string) {
  if (filter === 'all') return true;
  if (filter === 'quick') return ['5min', '10min', '15min'].includes(filmTime ?? '');
  if (filter === 'medium') return ['15min', '20min', '30min'].includes(filmTime ?? '');
  if (filter === 'long') return ['30min', '1hr', '1hr_plus'].includes(filmTime ?? '');
  return true;
}

function matchPeopleRange(people: string | undefined, filter: string) {
  if (filter === 'all') return true;
  if (filter === 'solo') return people === 'solo';
  if (filter === 'small') return people === 'duo' || people === 'small_team';
  if (filter === 'team') return people === 'team';
  return true;
}

function LeTrendMark({ size = 14 }: { size?: number }) {
  return (
    <img
      src="/lt-transparent.png"
      alt="LeTrend"
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  );
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { key: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const active = value !== 'all';

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((current) => !current)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          borderRadius: LeTrendRadius.md,
          border: `1px solid ${active ? LeTrendColors.brownLight : LeTrendColors.border}`,
          background: active ? LeTrendColors.surface : LeTrendColors.cream,
          color: active ? LeTrendColors.brownDark : LeTrendColors.textSecondary,
          fontSize: LeTrendTypography.fontSize.sm,
          fontWeight: LeTrendTypography.fontWeight.medium,
          cursor: 'pointer',
        }}
      >
        <span>{active ? options.find((option) => option.key === value)?.label : label}</span>
        <span style={{ fontSize: 9, opacity: 0.5 }}>v</span>
      </button>

      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: 160,
            background: '#fff',
            border: `1px solid ${LeTrendColors.borderMedium}`,
            borderRadius: LeTrendRadius.lg,
            boxShadow: LeTrendShadows.lg,
            overflow: 'hidden',
            zIndex: 20,
          }}
        >
          <button
            onClick={() => {
              onChange('all');
              setOpen(false);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '9px 14px',
              border: 'none',
              background: value === 'all' ? LeTrendColors.surface : '#fff',
              fontSize: LeTrendTypography.fontSize.sm,
              cursor: 'pointer',
            }}
          >
            Alla
          </button>

          {options.map((option) => (
            <button
              key={option.key}
              onClick={() => {
                onChange(option.key);
                setOpen(false);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '9px 14px',
                border: 'none',
                borderTop: `1px solid ${LeTrendColors.border}`,
                background: value === option.key ? LeTrendColors.surface : '#fff',
                fontSize: LeTrendTypography.fontSize.sm,
                cursor: 'pointer',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: LeTrendRadius.full,
        background: LeTrendColors.surface,
        color: LeTrendColors.brownDark,
        fontSize: LeTrendTypography.fontSize.xs,
        fontWeight: LeTrendTypography.fontWeight.medium,
      }}
    >
      {label}
      <button
        onClick={onClear}
        style={{
          border: 'none',
          background: 'none',
          color: LeTrendColors.textMuted,
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
          fontSize: 11,
        }}
      >
        x
      </button>
    </span>
  );
}

function ConceptCard({
  concept,
  assignmentCount,
  onAssign,
}: {
  concept: ConceptLibraryItem;
  assignmentCount: number;
  onAssign: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const thumbnail = concept.tiktokThumbnail || getYouTubeThumbnail(concept.sourceUrl);
  const isVertical = (concept.platform ?? detectPlatform(concept.sourceUrl ?? undefined)) !== 'youtube';
  const sourceBadge = getSourceBadge(concept.source);
  const difficulty = display.difficulty(concept.difficulty);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: LeTrendColors.cream,
        borderRadius: LeTrendRadius.lg,
        border: `1px solid ${LeTrendColors.border}`,
        overflow: 'hidden',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered ? LeTrendShadows.lg : 'none',
      }}
    >
      <div
        style={{
          aspectRatio: isVertical ? '9 / 16' : '16 / 9',
          maxHeight: isVertical ? 280 : undefined,
          background: LeTrendColors.surfaceLight,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.4s ease',
              transform: hovered ? 'scale(1.04)' : 'scale(1)',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: LeTrendColors.textMuted,
              fontSize: 13,
            }}
          >
            <span style={{ opacity: 0.5 }}>▶</span>
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'rgba(255,255,255,0.92)',
            padding: '3px 8px',
            borderRadius: LeTrendRadius.sm,
          }}
        >
          {sourceBadge.useLogo ? <LeTrendMark /> : null}
          {!sourceBadge.useLogo ? (
            <span
              style={{
                fontSize: LeTrendTypography.fontSize.xs,
                fontWeight: LeTrendTypography.fontWeight.bold,
                color: LeTrendColors.brownDark,
              }}
            >
              {sourceBadge.label}
            </span>
          ) : null}
        </div>

        <div
          title={difficulty.label}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: difficulty.color,
            border: '1.5px solid rgba(255,255,255,0.8)',
          }}
        />
      </div>

      <div style={{ padding: '10px 12px 12px' }}>
        <h3
          style={{
            margin: '0 0 4px',
            fontSize: LeTrendTypography.fontSize.sm,
            fontWeight: LeTrendTypography.fontWeight.semibold,
            color: LeTrendColors.textPrimary,
            lineHeight: LeTrendTypography.lineHeight.tight,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {concept.headline_sv || concept.headline}
        </h3>

        <div
          style={{
            fontSize: LeTrendTypography.fontSize.xs,
            color: assignmentCount > 0 ? LeTrendColors.success : LeTrendColors.textMuted,
            marginBottom: 8,
          }}
        >
          {assignmentCount > 0
            ? `${assignmentCount} kund${assignmentCount > 1 ? 'er' : ''}`
            : 'Ej tilldelad'}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <Link
            href={`/studio/concepts/${concept.id}/review`}
            style={{
              flex: 1,
              textAlign: 'center',
              textDecoration: 'none',
              padding: '6px 0',
              borderRadius: LeTrendRadius.md,
              background: LeTrendColors.surface,
              color: LeTrendColors.brownDark,
              border: `1px solid ${LeTrendColors.border}`,
              fontSize: LeTrendTypography.fontSize.xs,
              fontWeight: LeTrendTypography.fontWeight.medium,
            }}
          >
            Granska
          </Link>
          <button
            onClick={onAssign}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: LeTrendRadius.md,
              background: LeTrendColors.brownLight,
              color: LeTrendColors.cream,
              fontSize: LeTrendTypography.fontSize.xs,
              fontWeight: LeTrendTypography.fontWeight.medium,
              cursor: 'pointer',
              padding: '6px 0',
            }}
          >
            Tilldela
          </button>
        </div>
      </div>
    </div>
  );
}

async function fetchTikTokThumbnails(concepts: ConceptLibraryItem[]): Promise<Record<string, string>> {
  const tiktokConcepts = concepts.filter(
    (concept) =>
      (concept.platform ?? detectPlatform(concept.sourceUrl ?? undefined)) === 'tiktok' &&
      concept.sourceUrl,
  );
  const result: Record<string, string> = {};

  for (let index = 0; index < tiktokConcepts.length; index += 5) {
    const batch = tiktokConcepts.slice(index, index + 5);
    await Promise.all(
      batch.map(async (concept) => {
        try {
          const response = await fetch(
            `https://www.tiktok.com/oembed?url=${encodeURIComponent(concept.sourceUrl!)}`,
          );
          if (!response.ok) return;
          const payload = await response.json();
          if (typeof payload.thumbnail_url === 'string' && payload.thumbnail_url) {
            result[concept.id] = payload.thumbnail_url;
          }
        } catch {}
      }),
    );
  }

  return result;
}

export default function StudioConceptsPage() {
  const router = useRouter();
  const [concepts, setConcepts] = useState<ConceptLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [peopleFilter, setPeopleFilter] = useState('all');
  const [filmTimeFilter, setFilmTimeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});
  const [customerConceptCounts, setCustomerConceptCounts] = useState<Record<string, number>>({});
  const [pendingConcepts, setPendingConcepts] = useState<PendingConcept[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; business_name: string }>>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<ConceptLibraryItem | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customerPreview, setCustomerPreview] = useState<'loading' | { headline: string }[] | null>(null);
  const [tiktokThumbs, setTiktokThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    void Promise.all([
      loadConceptsData(),
      fetchPendingConcepts(),
      fetchCustomers(),
      fetchAssignmentCounts(),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (concepts.length === 0) return;
    void fetchTikTokThumbnails(concepts).then(setTiktokThumbs);
  }, [concepts]);

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerPreview(null);
      return;
    }

    setCustomerPreview('loading');
    void (async () => {
      try {
        const { data } = await supabase
          .from('customer_concepts')
          .select('concept_id, concepts(overrides)')
          .eq('customer_profile_id', selectedCustomer)
          .order('created_at', { ascending: false })
          .limit(3);

        if (!data) {
          setCustomerPreview([]);
          return;
        }

        setCustomerPreview(
          data.map((row) => {
            const overrides = ((row.concepts as { overrides?: Record<string, unknown> } | null)
              ?.overrides ?? {}) as Record<string, unknown>;
            return {
              headline:
                typeof overrides.headline_sv === 'string' && overrides.headline_sv.trim()
                  ? overrides.headline_sv.trim()
                  : '(Inget namn)',
            };
          }),
        );
      } catch {
        setCustomerPreview([]);
      }
    })();
  }, [selectedCustomer]);

  const loadConceptsData = async () => {
    const { data, error } = await supabase
      .from('concepts')
      .select('id, source, is_active, created_at, backend_data, overrides')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading concepts:', error);
      setConcepts([]);
      return;
    }

    setConcepts(
      (data || []).map((row) => {
        const backend = row.backend_data as BackendClip & { source_url?: string };
        const concept = translateClipToConcept(
          backend,
          (row.overrides as ClipOverride | null) || undefined,
        );

        return {
          ...concept,
          source: (row.source as ConceptSource) || 'cm_created',
          created_at: row.created_at as string | null,
          is_active: Boolean(row.is_active),
          platform: backend.platform ?? detectPlatform(backend.source_url ?? backend.url),
          sourceUrl: backend.source_url ?? concept.sourceUrl,
          gcsUri: backend.gcs_uri ?? concept.gcsUri,
        };
      }),
    );
  };

  const fetchPendingConcepts = async () => {
    try {
      const { data } = await supabase
        .from('concepts')
        .select('id, overrides, created_at')
        .eq('is_active', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!data) return;

      setPendingConcepts(
        data.map((row) => {
          const overrides = (row.overrides as Record<string, unknown>) ?? {};
          const read = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
          return {
            id: row.id as string,
            headline: read(overrides.headline_sv) || '(Inget namn)',
          };
        }),
      );
    } catch (error) {
      console.error('Error loading pending concepts:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data } = await supabase
        .from('customer_profiles')
        .select('id, business_name')
        .order('business_name');
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchAssignmentCounts = async () => {
    try {
      const { data } = await supabase.from('customer_concepts').select('concept_id, customer_profile_id');
      if (!data) return;

      const counts: Record<string, number> = {};
      const customerCounts: Record<string, number> = {};

      for (const row of data) {
        const conceptId = row.concept_id as string;
        const customerId = row.customer_profile_id as string;
        counts[conceptId] = (counts[conceptId] ?? 0) + 1;
        customerCounts[customerId] = (customerCounts[customerId] ?? 0) + 1;
      }

      setAssignmentCounts(counts);
      setCustomerConceptCounts(customerCounts);
    } catch (error) {
      console.error('Error fetching assignment counts:', error);
    }
  };

  const enrichedConcepts = useMemo(
    () =>
      concepts.map((concept) => ({
        ...concept,
        tiktokThumbnail: tiktokThumbs[concept.id] || concept.tiktokThumbnail,
      })),
    [concepts, tiktokThumbs],
  );

  const filteredConcepts = useMemo(
    () =>
      enrichedConcepts.filter((concept) => {
        const query = search.trim().toLowerCase();
        const matchesSearch =
          !query ||
          (concept.headline_sv || concept.headline).toLowerCase().includes(query) ||
          concept.description_sv?.toLowerCase().includes(query) ||
          concept.vibeAlignments?.some((vibe) => vibe.toLowerCase().includes(query));

        return (
          matchesSearch &&
          (difficultyFilter === 'all' || concept.difficulty === difficultyFilter) &&
          matchPeopleRange(concept.peopleNeeded, peopleFilter) &&
          matchFilmTimeRange(concept.filmTime, filmTimeFilter) &&
          (sourceFilter === 'all' || concept.source === sourceFilter) &&
          (!filterUnassigned || (assignmentCounts[concept.id] ?? 0) === 0)
        );
      }),
    [
      assignmentCounts,
      difficultyFilter,
      enrichedConcepts,
      filmTimeFilter,
      filterUnassigned,
      peopleFilter,
      search,
      sourceFilter,
    ],
  );

  const activeFilterCount = [
    difficultyFilter !== 'all',
    peopleFilter !== 'all',
    filmTimeFilter !== 'all',
    sourceFilter !== 'all',
    filterUnassigned,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearch('');
    setDifficultyFilter('all');
    setPeopleFilter('all');
    setFilmTimeFilter('all');
    setSourceFilter('all');
    setFilterUnassigned(false);
  };

  const handleAssignToCustomer = async () => {
    if (!selectedConcept || !selectedCustomer) return;

    try {
      const response = await fetch(`/api/studio-v2/customers/${selectedCustomer}/concepts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept_id: selectedConcept.id }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      const payload = await response.json().catch(() => ({}));
      const assignedId = typeof payload?.concept?.id === 'string' ? payload.concept.id : null;

      setShowAssignModal(false);
      setSelectedConcept(null);
      setSelectedCustomer('');
      router.push(
        `/studio/customers/${selectedCustomer}?section=koncept${
          assignedId ? `&justAdded=${assignedId}` : ''
        }`,
      );
    } catch (error) {
      console.error('Error assigning concept:', error);
      alert(error instanceof Error ? error.message : 'Kunde inte tilldela konceptet');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: LeTrendColors.textMuted }}>
        Laddar koncept...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', fontFamily: LeTrendTypography.fontFamily.body }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: LeTrendTypography.fontSize['3xl'],
              fontWeight: LeTrendTypography.fontWeight.bold,
              color: LeTrendColors.textPrimary,
              fontFamily: LeTrendTypography.fontFamily.heading,
            }}
          >
            Konceptbibliotek
          </h1>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: LeTrendTypography.fontSize.sm,
              color: LeTrendColors.textMuted,
            }}
          >
            {concepts.length} koncept
            {pendingConcepts.length > 0 ? (
              <>
                {' '}
                · <span style={{ color: LeTrendColors.warning }}>{pendingConcepts.length} ej granskade</span>
              </>
            ) : null}
          </p>
        </div>

        <button onClick={() => setShowUploadModal(true)} style={buttonStyle('primary')}>
          + Nytt koncept
        </button>
      </div>

      {pendingConcepts.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 16 }}>
          {pendingConcepts.map((pendingConcept) => (
            <Link
              key={pendingConcept.id}
              href={`/studio/concepts/${pendingConcept.id}/review`}
              style={{
                flexShrink: 0,
                padding: '6px 12px',
                borderRadius: LeTrendRadius.full,
                border: `1px solid ${LeTrendColors.warning}44`,
                background: '#FFF8EC',
                textDecoration: 'none',
                color: '#7C5221',
                fontSize: LeTrendTypography.fontSize.xs,
                fontWeight: LeTrendTypography.fontWeight.medium,
                whiteSpace: 'nowrap',
              }}
            >
              {pendingConcept.headline}
            </Link>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ flex: '1 1 220px', maxWidth: 280 }}>
          <input
            type="text"
            placeholder="Sok titel, vibe..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ ...inputStyle(), width: '100%' }}
          />
        </div>

        <FilterDropdown
          label="Svarighetsgrad"
          value={difficultyFilter}
          options={DIFFICULTY_OPTIONS}
          onChange={setDifficultyFilter}
        />
        <FilterDropdown
          label="Personer"
          value={peopleFilter}
          options={PEOPLE_RANGE_OPTIONS}
          onChange={setPeopleFilter}
        />
        <FilterDropdown
          label="Inspelningstid"
          value={filmTimeFilter}
          options={FILM_TIME_RANGE_OPTIONS}
          onChange={setFilmTimeFilter}
        />
        <FilterDropdown
          label="Kalla"
          value={sourceFilter}
          options={[
            { key: 'hagen', label: 'LeTrend' },
            { key: 'cm_created', label: 'CM-skapat' },
          ]}
          onChange={setSourceFilter}
        />

        <button
          onClick={() => setFilterUnassigned((current) => !current)}
          style={{
            padding: '7px 12px',
            borderRadius: LeTrendRadius.md,
            border: `1px solid ${filterUnassigned ? LeTrendColors.brownLight : LeTrendColors.border}`,
            background: filterUnassigned ? LeTrendColors.surface : LeTrendColors.cream,
            color: filterUnassigned ? LeTrendColors.brownDark : LeTrendColors.textSecondary,
            fontSize: LeTrendTypography.fontSize.sm,
            fontWeight: LeTrendTypography.fontWeight.medium,
            cursor: 'pointer',
          }}
        >
          Ej tilldelad
        </button>
      </div>

      {activeFilterCount > 0 ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          {difficultyFilter !== 'all' ? (
            <FilterPill
              label={DIFFICULTY_OPTIONS.find((option) => option.key === difficultyFilter)?.label ?? ''}
              onClear={() => setDifficultyFilter('all')}
            />
          ) : null}
          {peopleFilter !== 'all' ? (
            <FilterPill
              label={PEOPLE_RANGE_OPTIONS.find((option) => option.key === peopleFilter)?.label ?? ''}
              onClear={() => setPeopleFilter('all')}
            />
          ) : null}
          {filmTimeFilter !== 'all' ? (
            <FilterPill
              label={FILM_TIME_RANGE_OPTIONS.find((option) => option.key === filmTimeFilter)?.label ?? ''}
              onClear={() => setFilmTimeFilter('all')}
            />
          ) : null}
          {sourceFilter !== 'all' ? (
            <FilterPill
              label={sourceFilter === 'hagen' ? 'LeTrend' : 'CM-skapat'}
              onClear={() => setSourceFilter('all')}
            />
          ) : null}
          {filterUnassigned ? (
            <FilterPill label="Ej tilldelad" onClear={() => setFilterUnassigned(false)} />
          ) : null}
          <button
            onClick={clearAllFilters}
            style={{
              border: 'none',
              background: 'none',
              color: LeTrendColors.textMuted,
              fontSize: LeTrendTypography.fontSize.xs,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Rensa ({activeFilterCount})
          </button>
        </div>
      ) : null}

      <div style={{ fontSize: LeTrendTypography.fontSize.xs, color: LeTrendColors.textMuted, marginBottom: 10 }}>
        {filteredConcepts.length} av {concepts.length}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: 14,
        }}
      >
        {filteredConcepts.map((concept) => (
          <ConceptCard
            key={concept.id}
            concept={concept}
            assignmentCount={assignmentCounts[concept.id] ?? 0}
            onAssign={() => {
              setSelectedConcept(concept);
              setShowAssignModal(true);
            }}
          />
        ))}
      </div>

      {filteredConcepts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: LeTrendColors.textMuted }}>
          <div style={{ fontSize: LeTrendTypography.fontSize.md, color: LeTrendColors.textSecondary }}>
            Inga koncept hittades
          </div>
          {activeFilterCount > 0 ? (
            <button
              onClick={clearAllFilters}
              style={{
                border: 'none',
                background: 'none',
                color: LeTrendColors.brownLight,
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: LeTrendTypography.fontSize.sm,
                marginTop: 8,
              }}
            >
              Rensa filter
            </button>
          ) : null}
        </div>
      ) : null}

      {showAssignModal ? (
        <div
          onClick={() => {
            setShowAssignModal(false);
            setSelectedConcept(null);
            setSelectedCustomer('');
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#fff',
              padding: 24,
              borderRadius: LeTrendRadius.xl,
              boxShadow: LeTrendShadows.xl,
            }}
          >
            <h3
              style={{
                margin: '0 0 4px',
                fontSize: LeTrendTypography.fontSize.xl,
                fontWeight: LeTrendTypography.fontWeight.bold,
                fontFamily: LeTrendTypography.fontFamily.heading,
                color: LeTrendColors.textPrimary,
              }}
            >
              Tilldela till kund
            </h3>
            <p
              style={{
                margin: '0 0 16px',
                fontSize: LeTrendTypography.fontSize.sm,
                color: LeTrendColors.textMuted,
              }}
            >
              {selectedConcept?.headline_sv || selectedConcept?.headline}
            </p>

            <div
              style={{
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.lg,
                maxHeight: 240,
                overflowY: 'auto',
                marginBottom: 16,
              }}
            >
              {customers.map((customer, index) => {
                const selected = selectedCustomer === customer.id;
                const count = customerConceptCounts[customer.id] ?? 0;

                return (
                  <div
                    key={customer.id}
                    onClick={() => setSelectedCustomer(customer.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 14px',
                      cursor: 'pointer',
                      background: selected ? LeTrendColors.surface : '#fff',
                      borderTop: index > 0 ? `1px solid ${LeTrendColors.border}` : 'none',
                    }}
                  >
                    <span
                      style={{
                        fontSize: LeTrendTypography.fontSize.sm,
                        fontWeight: selected ? 600 : 400,
                        color: selected ? LeTrendColors.brownDark : LeTrendColors.textPrimary,
                      }}
                    >
                      {customer.business_name}
                    </span>
                    <span style={{ fontSize: LeTrendTypography.fontSize.xs, color: LeTrendColors.textMuted }}>
                      {count > 0 ? count : '-'}
                    </span>
                  </div>
                );
              })}
            </div>

            {selectedCustomer && customerPreview && customerPreview !== 'loading' && customerPreview.length > 0 ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: '8px 10px',
                  background: LeTrendColors.surface,
                  borderRadius: LeTrendRadius.md,
                  fontSize: LeTrendTypography.fontSize.xs,
                  color: LeTrendColors.textSecondary,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 3 }}>Senaste koncept</div>
                {customerPreview.map((preview) => (
                  <div key={preview.headline}>{preview.headline}</div>
                ))}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedConcept(null);
                  setSelectedCustomer('');
                }}
                style={buttonStyle('secondary')}
              >
                Avbryt
              </button>
              <button
                onClick={() => {
                  void handleAssignToCustomer();
                }}
                disabled={!selectedCustomer}
                style={{
                  ...buttonStyle('primary'),
                  opacity: selectedCustomer ? 1 : 0.5,
                  cursor: selectedCustomer ? 'pointer' : 'not-allowed',
                }}
              >
                Tilldela
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <UploadConceptModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={(id) => {
          setShowUploadModal(false);
          router.push(`/studio/concepts/${id}/review`);
        }}
      />
    </div>
  );
}
