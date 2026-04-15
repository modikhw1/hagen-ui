'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UploadConceptModal } from '@/components/studio/UploadConceptModal';
import { useAuth } from '@/contexts/AuthContext';
import { BUDGET_VALUES, BUSINESS_TYPE_VALUES, DIFFICULTY_VALUES, FILM_TIME_VALUES } from '@/lib/concept-enrichment';
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
  created_by?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  is_active: boolean;
  platform?: string | null;
  tiktokThumbnail?: string | null;
};
type PendingConcept = {
  id: string;
  headline: string;
  created_at: string | null;
  created_by?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};
type LibraryScope = 'mine' | 'all';
type SortMode = 'recent_upload' | 'recently_used' | 'most_assigned';
type ReuseFilter = 'all' | 'unassigned' | 'light' | 'popular';

const DIFFICULTY_OPTIONS = DIFFICULTY_VALUES.map((key) => ({
  key,
  label: display.difficulty(key).label,
  color: display.difficulty(key).color,
}));

const FILM_TIME_RANGE_OPTIONS = FILM_TIME_VALUES.reduce<Array<{ key: string; label: string }>>((groups, value) => {
  const range = display.filmTimeRange(value);
  if (!groups.some((group) => group.key === range.key)) {
    groups.push({ key: range.key, label: range.label });
  }
  return groups;
}, []);

const PEOPLE_RANGE_OPTIONS = [
  { key: 'solo', label: 'Solo' },
  { key: 'small', label: '2-3 pers' },
  { key: 'team', label: '4+' },
];

const BUSINESS_TYPE_OPTIONS = BUSINESS_TYPE_VALUES.map((key) => ({
  key,
  label: display.businessType(key).label,
  icon: display.businessType(key).icon,
  color: display.businessType(key).color,
}));

const BUDGET_OPTIONS = BUDGET_VALUES.map((key) => ({
  key,
  label: display.budget(key).label,
}));

const SOURCE_OPTIONS = [
  { key: 'hagen', label: 'LeTrend' },
  { key: 'cm_created', label: 'CM-skapat' },
];

const SORT_OPTIONS = [
  { key: 'recent_upload', label: 'Senast uppladdade' },
  { key: 'recently_used', label: 'Senast anvanda' },
  { key: 'most_assigned', label: 'Mest ateranvanda' },
];

const REUSE_OPTIONS = [
  { key: 'all', label: 'Alla' },
  { key: 'unassigned', label: 'Ej tilldelad' },
  { key: 'light', label: '1-3 kunder' },
  { key: 'popular', label: '4+ kunder' },
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

function matchFilmTimeRange(filmTime: string | undefined, filter: string) {
  if (filter === 'all') return true;
  if (!filmTime) return false;
  return display.filmTimeRange(filmTime).key === filter;
}

function matchPeopleRange(people: string | undefined, filter: string) {
  if (filter === 'all') return true;
  if (filter === 'solo') return people === 'solo';
  if (filter === 'small') return people === 'duo' || people === 'small_team';
  if (filter === 'team') return people === 'team';
  return true;
}

function matchBusinessType(types: string[] | undefined, filter: string) {
  if (filter === 'all') return true;
  return (types || []).includes(filter);
}

function matchReuseFilter(assignmentCount: number, filter: ReuseFilter) {
  if (filter === 'all') return true;
  if (filter === 'unassigned') return assignmentCount === 0;
  if (filter === 'light') return assignmentCount >= 1 && assignmentCount <= 3;
  if (filter === 'popular') return assignmentCount >= 4;
  return true;
}

function formatRelativeDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'idag';
  if (diffDays === 1) return 'igar';
  if (diffDays < 7) return `${diffDays} dagar sedan`;
  return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
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

function SegmentedFilter({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string; color?: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: 4,
        borderRadius: LeTrendRadius.lg,
        border: `1px solid ${LeTrendColors.border}`,
        background: '#fff',
        flexWrap: 'wrap',
      }}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            style={{
              padding: '7px 10px',
              borderRadius: LeTrendRadius.md,
              border: 'none',
              background: active ? (option.color ? `${option.color}18` : LeTrendColors.surface) : 'transparent',
              color: active ? (option.color || LeTrendColors.brownDark) : LeTrendColors.textSecondary,
              fontSize: LeTrendTypography.fontSize.sm,
              fontWeight: active ? LeTrendTypography.fontWeight.semibold : LeTrendTypography.fontWeight.medium,
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterChipRow({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string; icon?: string; color?: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={() => onChange('all')}
        style={{
          padding: '7px 12px',
          borderRadius: LeTrendRadius.full,
          border: `1px solid ${value === 'all' ? LeTrendColors.brownLight : LeTrendColors.border}`,
          background: value === 'all' ? LeTrendColors.surface : '#fff',
          color: value === 'all' ? LeTrendColors.brownDark : LeTrendColors.textSecondary,
          fontSize: LeTrendTypography.fontSize.sm,
          fontWeight: LeTrendTypography.fontWeight.medium,
          cursor: 'pointer',
        }}
      >
        Alla branscher
      </button>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: LeTrendRadius.full,
              border: `1px solid ${active ? option.color || LeTrendColors.brownLight : LeTrendColors.border}`,
              background: active ? `${option.color || LeTrendColors.surface}18` : '#fff',
              color: active ? option.color || LeTrendColors.brownDark : LeTrendColors.textSecondary,
              fontSize: LeTrendTypography.fontSize.sm,
              fontWeight: LeTrendTypography.fontWeight.medium,
              cursor: 'pointer',
            }}
          >
            {option.icon ? <span>{option.icon}</span> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ConceptCard({
  concept,
  assignmentCount,
  isAlreadyAssigned,
  lastUsedAt,
  onReview,
  onAssign,
}: {
  concept: ConceptLibraryItem;
  assignmentCount: number;
  isAlreadyAssigned: boolean;
  lastUsedAt?: string | null;
  onReview: () => void;
  onAssign: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const thumbnail = concept.tiktokThumbnail || getYouTubeThumbnail(concept.sourceUrl);
  const isVertical = (concept.platform ?? detectPlatform(concept.sourceUrl ?? undefined)) !== 'youtube';
  const difficulty = display.difficulty(concept.difficulty);
  const filmTime = display.filmTime(concept.filmTime);
  const peopleNeededShort = display.peopleNeededShort(concept.peopleNeeded);
  const businessTypeBadges = concept.businessTypes.slice(0, 3).map((type) => display.businessType(type));
  const relativeUsedAt = formatRelativeDate(lastUsedAt);
  const assignmentLabel = assignmentCount > 0
    ? `${assignmentCount} kund${assignmentCount > 1 ? 'er' : ''}`
    : 'Ej tilldelad';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onReview}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onReview();
        }
      }}
      style={{
        background: LeTrendColors.cream,
        borderRadius: LeTrendRadius.lg,
        border: `1px solid ${LeTrendColors.border}`,
        overflow: 'hidden',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered ? LeTrendShadows.lg : 'none',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          aspectRatio: isVertical ? '9 / 16' : '16 / 9',
          maxHeight: isVertical ? 340 : undefined,
          minHeight: isVertical ? 320 : 220,
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
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 12,
            background: hovered
              ? 'linear-gradient(to top, rgba(10,10,10,0.84) 0%, rgba(10,10,10,0.36) 48%, rgba(10,10,10,0.1) 100%)'
              : 'linear-gradient(to top, rgba(10,10,10,0.34) 0%, rgba(10,10,10,0) 48%)',
            transition: 'background 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
            <span
              style={{
                padding: '4px 8px',
                borderRadius: LeTrendRadius.full,
                background: 'rgba(255,255,255,0.92)',
                color: LeTrendColors.brownDark,
                fontSize: LeTrendTypography.fontSize.xs,
                fontWeight: LeTrendTypography.fontWeight.semibold,
              }}
            >
              {concept.source === 'hagen' ? 'LeTrend' : 'CM'}
            </span>
            {relativeUsedAt ? (
              <span
                style={{
                  padding: '4px 8px',
                  borderRadius: LeTrendRadius.full,
                  background: 'rgba(255,255,255,0.18)',
                  color: '#fff',
                  fontSize: LeTrendTypography.fontSize.xs,
                  fontWeight: LeTrendTypography.fontWeight.medium,
                  backdropFilter: 'blur(4px)',
                }}
              >
                {assignmentLabel} · {relativeUsedAt}
              </span>
            ) : null}
          </div>

          <div
            style={{
              opacity: hovered ? 1 : 0,
              transform: hovered ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.18s ease, transform 0.18s ease',
              pointerEvents: hovered ? 'auto' : 'none',
            }}
          >
            <div
              style={{
                marginBottom: 10,
                color: '#fff',
                fontSize: LeTrendTypography.fontSize.sm,
                lineHeight: 1.5,
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {concept.description_sv || 'Oppna konceptet for att granska och tilldela det.'}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <span
                style={{
                  padding: '4px 8px',
                  borderRadius: LeTrendRadius.full,
                  background: 'rgba(255,255,255,0.92)',
                  color: difficulty.color,
                  fontSize: LeTrendTypography.fontSize.xs,
                  fontWeight: LeTrendTypography.fontWeight.semibold,
                }}
              >
                {difficulty.label}
              </span>
              {businessTypeBadges.map((badge) => (
                <span
                  key={badge.label}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    borderRadius: LeTrendRadius.full,
                    background: 'rgba(255,255,255,0.16)',
                    color: '#fff',
                    fontSize: LeTrendTypography.fontSize.xs,
                    fontWeight: LeTrendTypography.fontWeight.medium,
                  }}
                >
                  <span>{badge.icon}</span>
                  <span>{badge.label}</span>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link
                href={`/studio/concepts/${concept.id}/review`}
                onClick={(event) => event.stopPropagation()}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  textDecoration: 'none',
                  padding: '8px 0',
                  borderRadius: LeTrendRadius.md,
                  background: '#fff',
                  color: LeTrendColors.brownDark,
                  fontSize: LeTrendTypography.fontSize.xs,
                  fontWeight: LeTrendTypography.fontWeight.semibold,
                }}
              >
                Granska
              </Link>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onAssign();
                }}
                disabled={isAlreadyAssigned}
                style={{
                  flex: 1,
                  border: 'none',
                  borderRadius: LeTrendRadius.md,
                  background: isAlreadyAssigned ? 'rgba(255,255,255,0.35)' : LeTrendColors.brownLight,
                  color: '#fff',
                  fontSize: LeTrendTypography.fontSize.xs,
                  fontWeight: LeTrendTypography.fontWeight.semibold,
                  cursor: isAlreadyAssigned ? 'not-allowed' : 'pointer',
                  padding: '8px 0',
                }}
              >
                {isAlreadyAssigned ? 'Redan tilldelad' : 'Tilldela'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 12px 14px' }}>
        <h3
          style={{
            margin: '0 0 6px',
            fontSize: LeTrendTypography.fontSize.md,
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
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            marginBottom: 8,
            fontSize: LeTrendTypography.fontSize.xs,
            color: LeTrendColors.textSecondary,
          }}
        >
          <span>🎬 {filmTime.label}</span>
          <span>·</span>
          <span>👤 {peopleNeededShort}</span>
          <span>·</span>
          <span>{difficulty.label}</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            fontSize: LeTrendTypography.fontSize.xs,
            color: isAlreadyAssigned
              ? '#92400e'
              : assignmentCount > 0
                ? LeTrendColors.success
                : LeTrendColors.textMuted,
          }}
        >
          <span>{assignmentLabel}</span>
          {relativeUsedAt ? <span>Senast anvand {relativeUsedAt}</span> : null}
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
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const presetCustomerId = searchParams?.get('customerId')?.trim() || '';
  const [concepts, setConcepts] = useState<ConceptLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [libraryScope, setLibraryScope] = useState<LibraryScope>('mine');
  const [sortMode, setSortMode] = useState<SortMode>('recent_upload');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [peopleFilter, setPeopleFilter] = useState('all');
  const [filmTimeFilter, setFilmTimeFilter] = useState('all');
  const [businessTypeFilter, setBusinessTypeFilter] = useState('all');
  const [reuseFilter, setReuseFilter] = useState<ReuseFilter>('all');
  const [budgetFilter, setBudgetFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});
  const [recentAssignmentByConcept, setRecentAssignmentByConcept] = useState<Record<string, string>>({});
  const [customerLastAssignedAt, setCustomerLastAssignedAt] = useState<Record<string, string>>({});
  const [customerConceptCounts, setCustomerConceptCounts] = useState<Record<string, number>>({});
  const [pendingConcepts, setPendingConcepts] = useState<PendingConcept[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; business_name: string; account_manager_profile_id?: string | null }>>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<ConceptLibraryItem | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState(presetCustomerId);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPreview, setCustomerPreview] = useState<'loading' | { headline: string }[] | null>(null);
  const [selectedCustomerConceptIds, setSelectedCustomerConceptIds] = useState<string[]>([]);
  const [tiktokThumbs, setTiktokThumbs] = useState<Record<string, string>>({});

  const loadConceptsData = useCallback(async (scope: LibraryScope) => {
    try {
      const params = new URLSearchParams({ is_active: 'true', limit: '300' });
      if (scope === 'mine' && user?.id) {
        params.set('created_by', user.id);
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch(`/api/admin/concepts?${params.toString()}`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      const rows = Array.isArray(payload.concepts) ? payload.concepts : [];
      setConcepts(
        rows.map((row) => {
          const backend = row.backend_data as BackendClip & { source_url?: string };
          const concept = translateClipToConcept(
            backend,
            (row.overrides as ClipOverride | null) || undefined,
          );

          return {
            ...concept,
            id: row.id as string,
            source: (row.source as ConceptSource) || 'cm_created',
            created_at: row.created_at as string | null,
            created_by: typeof row.created_by === 'string' ? row.created_by : null,
            reviewed_at: typeof row.reviewed_at === 'string' ? row.reviewed_at : null,
            reviewed_by: typeof row.reviewed_by === 'string' ? row.reviewed_by : null,
            is_active: Boolean(row.is_active),
            platform: backend.platform ?? detectPlatform(backend.source_url ?? backend.url),
            sourceUrl: backend.source_url ?? concept.sourceUrl,
            gcsUri: backend.gcs_uri ?? concept.gcsUri,
          };
        }),
      );
    } catch (error) {
      console.error('Error loading concepts:', error);
      setConcepts([]);
    }
  }, [user?.id]);

  const fetchPendingConcepts = useCallback(async (scope: LibraryScope) => {
    try {
      let query = supabase
        .from('concepts')
        .select('id, overrides, created_at, created_by, reviewed_at, reviewed_by')
        .eq('is_active', false)
        .order('created_at', { ascending: false })
        .limit(20);

      if (scope === 'mine' && user?.id) {
        query = query.eq('created_by', user.id);
      }

      const { data } = await query;

      if (!data) return;

      setPendingConcepts(
        data.map((row) => {
          const overrides = (row.overrides as Record<string, unknown>) ?? {};
          const read = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
          return {
            id: row.id as string,
            headline: read(overrides.headline_sv) || '(Inget namn)',
            created_at: row.created_at as string | null,
            created_by: typeof row.created_by === 'string' ? row.created_by : null,
            reviewed_at: typeof row.reviewed_at === 'string' ? row.reviewed_at : null,
            reviewed_by: typeof row.reviewed_by === 'string' ? row.reviewed_by : null,
          };
        }),
      );
    } catch (error) {
      console.error('Error loading pending concepts:', error);
    }
  }, [user?.id]);

  const fetchCustomers = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('customer_profiles')
        .select('id, business_name, account_manager_profile_id')
        .order('business_name');

      const sorted = [...(data || [])].sort((a, b) => {
        const aOwned = a.account_manager_profile_id === userId ? 1 : 0;
        const bOwned = b.account_manager_profile_id === userId ? 1 : 0;
        if (aOwned !== bOwned) return bOwned - aOwned;
        return a.business_name.localeCompare(b.business_name, 'sv');
      });

      setCustomers(sorted);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  }, []);

  const fetchAssignmentCounts = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('customer_concepts')
        .select('concept_id, customer_profile_id, created_at');
      if (!data) return;

      const counts: Record<string, number> = {};
      const customerCounts: Record<string, number> = {};
      const customerLatest: Record<string, string> = {};

      const { data: ownedCustomers } = await supabase
        .from('customer_profiles')
        .select('id')
        .eq('account_manager_profile_id', userId);
      const ownedCustomerIds = new Set((ownedCustomers || []).map((row) => row.id as string));
      const conceptLatestUsed: Record<string, string> = {};

      for (const row of data) {
        const conceptId = row.concept_id as string;
        const customerId = row.customer_profile_id as string;
        counts[conceptId] = (counts[conceptId] ?? 0) + 1;
        customerCounts[customerId] = (customerCounts[customerId] ?? 0) + 1;
        if (typeof row.created_at === 'string') {
          if (!customerLatest[customerId] || row.created_at > customerLatest[customerId]) {
            customerLatest[customerId] = row.created_at;
          }
          if (ownedCustomerIds.has(customerId)) {
            if (!conceptLatestUsed[conceptId] || row.created_at > conceptLatestUsed[conceptId]) {
              conceptLatestUsed[conceptId] = row.created_at;
            }
          }
        }
      }

      setAssignmentCounts(counts);
      setCustomerConceptCounts(customerCounts);
      setRecentAssignmentByConcept(conceptLatestUsed);
      setCustomerLastAssignedAt(customerLatest);
    } catch (error) {
      console.error('Error fetching assignment counts:', error);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    setLoading(true);
    void Promise.all([
      loadConceptsData(libraryScope),
      fetchPendingConcepts(libraryScope),
      fetchCustomers(user.id),
      fetchAssignmentCounts(user.id),
    ]).finally(() => setLoading(false));
  }, [fetchAssignmentCounts, fetchCustomers, fetchPendingConcepts, libraryScope, loadConceptsData, user?.id]);

  useEffect(() => {
    if (concepts.length === 0) return;
    void fetchTikTokThumbnails(concepts).then(setTiktokThumbs);
  }, [concepts]);

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerPreview(null);
      setSelectedCustomerConceptIds([]);
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
          setSelectedCustomerConceptIds([]);
          return;
        }

        setSelectedCustomerConceptIds(
          data
            .map((row) => (typeof row.concept_id === 'string' ? row.concept_id : null))
            .filter((value): value is string => Boolean(value))
        );

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
        setSelectedCustomerConceptIds([]);
      }
    })();
  }, [selectedCustomer]);

  const selectedCustomerHasConcept = Boolean(
    selectedConcept && selectedCustomerConceptIds.includes(selectedConcept.id)
  );

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
          concept.vibeAlignments?.some((vibe) => vibe.toLowerCase().includes(query)) ||
          concept.businessTypes?.some((type) => display.businessType(type).label.toLowerCase().includes(query));

        return (
          matchesSearch &&
          (difficultyFilter === 'all' || concept.difficulty === difficultyFilter) &&
          matchPeopleRange(concept.peopleNeeded, peopleFilter) &&
          matchFilmTimeRange(concept.filmTime, filmTimeFilter) &&
          matchBusinessType(concept.businessTypes, businessTypeFilter) &&
          (budgetFilter === 'all' || concept.estimatedBudget === budgetFilter) &&
          (sourceFilter === 'all' || concept.source === sourceFilter) &&
          matchReuseFilter(assignmentCounts[concept.id] ?? 0, reuseFilter)
        );
      }),
    [
      assignmentCounts,
      budgetFilter,
      businessTypeFilter,
      difficultyFilter,
      enrichedConcepts,
      filmTimeFilter,
      peopleFilter,
      reuseFilter,
      search,
      sourceFilter,
    ],
  );

  const sortedConcepts = useMemo(() => {
    const items = [...filteredConcepts];

    items.sort((a, b) => {
      if (sortMode === 'most_assigned') {
        return (assignmentCounts[b.id] ?? 0) - (assignmentCounts[a.id] ?? 0);
      }

      if (sortMode === 'recently_used') {
        const aDate = recentAssignmentByConcept[a.id] ?? '';
        const bDate = recentAssignmentByConcept[b.id] ?? '';
        return bDate.localeCompare(aDate);
      }

      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });

    return items;
  }, [assignmentCounts, filteredConcepts, recentAssignmentByConcept, sortMode]);

  const activeFilterCount = [
    difficultyFilter !== 'all',
    peopleFilter !== 'all',
    filmTimeFilter !== 'all',
    businessTypeFilter !== 'all',
    reuseFilter !== 'all',
    budgetFilter !== 'all',
    sourceFilter !== 'all',
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearch('');
    setDifficultyFilter('all');
    setPeopleFilter('all');
    setFilmTimeFilter('all');
    setBusinessTypeFilter('all');
    setReuseFilter('all');
    setBudgetFilter('all');
    setSourceFilter('all');
  };

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    const items = customers.filter((customer) =>
      !query || customer.business_name.toLowerCase().includes(query)
    );

    return items.sort((a, b) => {
      const aOwned = a.account_manager_profile_id === user?.id ? 1 : 0;
      const bOwned = b.account_manager_profile_id === user?.id ? 1 : 0;
      if (aOwned !== bOwned) return bOwned - aOwned;

      const aRecent = customerLastAssignedAt[a.id] ?? '';
      const bRecent = customerLastAssignedAt[b.id] ?? '';
      if (aRecent !== bRecent) return bRecent.localeCompare(aRecent);

      return a.business_name.localeCompare(b.business_name, 'sv');
    });
  }, [customerLastAssignedAt, customerSearch, customers, user?.id]);

  const unreviewedPendingConcepts = pendingConcepts.filter((concept) => !concept.reviewed_at);
  const reviewedPendingConcepts = pendingConcepts.filter((concept) => concept.reviewed_at);

  const handleAssignToCustomer = async () => {
    if (!selectedConcept || !selectedCustomer) return;
    if (selectedCustomerConceptIds.includes(selectedConcept.id)) {
      alert('Konceptet är redan tilldelat till den här kunden');
      return;
    }

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
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setLibraryScope('mine');
                setSortMode('recent_upload');
              }}
              style={{
                padding: '7px 12px',
                borderRadius: LeTrendRadius.full,
                border: `1px solid ${libraryScope === 'mine' ? LeTrendColors.brownLight : LeTrendColors.border}`,
                background: libraryScope === 'mine' ? LeTrendColors.surface : '#fff',
                color: libraryScope === 'mine' ? LeTrendColors.brownDark : LeTrendColors.textSecondary,
                fontSize: LeTrendTypography.fontSize.sm,
                fontWeight: LeTrendTypography.fontWeight.semibold,
                cursor: 'pointer',
              }}
            >
              Mina koncept
            </button>
            <button
              type="button"
              onClick={() => setLibraryScope('all')}
              style={{
                padding: '7px 12px',
                borderRadius: LeTrendRadius.full,
                border: `1px solid ${libraryScope === 'all' ? LeTrendColors.brownLight : LeTrendColors.border}`,
                background: libraryScope === 'all' ? LeTrendColors.surface : '#fff',
                color: libraryScope === 'all' ? LeTrendColors.brownDark : LeTrendColors.textSecondary,
                fontSize: LeTrendTypography.fontSize.sm,
                fontWeight: LeTrendTypography.fontWeight.semibold,
                cursor: 'pointer',
              }}
            >
              Alla koncept
            </button>
          </div>
          <p
            style={{
              margin: '10px 0 0',
              fontSize: LeTrendTypography.fontSize.sm,
              color: LeTrendColors.textMuted,
            }}
          >
            {concepts.length} koncept
            {' '}
            i {libraryScope === 'mine' ? 'mitt arbetsbibliotek' : 'hela biblioteket'}
            {unreviewedPendingConcepts.length > 0 ? (
              <>
                {' '}
                · <span style={{ color: LeTrendColors.warning }}>{unreviewedPendingConcepts.length} ej granskade</span>
              </>
            ) : null}
            {reviewedPendingConcepts.length > 0 ? (
              <>
                {' '}
                · <span style={{ color: '#2563eb' }}>{reviewedPendingConcepts.length} review-klara</span>
              </>
            ) : null}
          </p>
        </div>

        <button onClick={() => setShowUploadModal(true)} style={buttonStyle('primary')}>
          + Nytt koncept
        </button>
      </div>

      {unreviewedPendingConcepts.length > 0 ? (
        <div
          style={{
            marginBottom: 18,
            padding: 16,
            borderRadius: LeTrendRadius.xl,
            background: '#fff8ec',
            border: `1px solid ${LeTrendColors.warning}33`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: LeTrendTypography.fontSize.lg, fontWeight: LeTrendTypography.fontWeight.bold, color: '#7c5221' }}>
                Vantar pa granskning ({unreviewedPendingConcepts.length} st)
              </div>
              <div style={{ fontSize: LeTrendTypography.fontSize.sm, color: '#9a6b3a' }}>
                Mini-kort for nya draft-koncept som behover review.
              </div>
            </div>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: LeTrendColors.warning,
                boxShadow: `0 0 0 6px ${LeTrendColors.warning}22`,
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {unreviewedPendingConcepts.map((pendingConcept) => (
              <div
                key={pendingConcept.id}
                style={{
                  padding: 12,
                  borderRadius: LeTrendRadius.lg,
                  background: '#fff',
                  border: `1px solid ${LeTrendColors.warning}22`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: LeTrendTypography.fontSize.sm, fontWeight: LeTrendTypography.fontWeight.semibold, color: LeTrendColors.textPrimary }}>
                    {pendingConcept.headline}
                  </div>
                  <div style={{ fontSize: LeTrendTypography.fontSize.xs, color: LeTrendColors.textMuted, marginTop: 4 }}>
                    Uppladdad {formatRelativeDate(pendingConcept.created_at) || 'nyss'}
                  </div>
                </div>
                <Link
                  href={`/studio/concepts/${pendingConcept.id}/review`}
                  style={{
                    flexShrink: 0,
                    textDecoration: 'none',
                    padding: '7px 10px',
                    borderRadius: LeTrendRadius.md,
                    background: LeTrendColors.brownLight,
                    color: '#fff',
                    fontSize: LeTrendTypography.fontSize.xs,
                    fontWeight: LeTrendTypography.fontWeight.semibold,
                  }}
                >
                  Granska
                </Link>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {reviewedPendingConcepts.length > 0 ? (
        <div
          style={{
            marginBottom: 18,
            padding: 16,
            borderRadius: LeTrendRadius.xl,
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: LeTrendTypography.fontSize.lg, fontWeight: LeTrendTypography.fontWeight.bold, color: '#1d4ed8' }}>
                Review-klara, ej publicerade ({reviewedPendingConcepts.length} st)
              </div>
              <div style={{ fontSize: LeTrendTypography.fontSize.sm, color: '#4767a6' }}>
                Koncept som ar klara att publiceras men fortfarande ligger utanfor biblioteket.
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {reviewedPendingConcepts.map((pendingConcept) => (
              <div
                key={pendingConcept.id}
                style={{
                  padding: 12,
                  borderRadius: LeTrendRadius.lg,
                  background: '#fff',
                  border: '1px solid #bfdbfe',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: LeTrendTypography.fontSize.sm, fontWeight: LeTrendTypography.fontWeight.semibold, color: LeTrendColors.textPrimary }}>
                    {pendingConcept.headline}
                  </div>
                  <div style={{ fontSize: LeTrendTypography.fontSize.xs, color: LeTrendColors.textMuted, marginTop: 4 }}>
                    Review-klar {formatRelativeDate(pendingConcept.reviewed_at) || 'nyss'}
                  </div>
                </div>
                <Link
                  href={`/studio/concepts/${pendingConcept.id}/review`}
                  style={{
                    flexShrink: 0,
                    textDecoration: 'none',
                    padding: '7px 10px',
                    borderRadius: LeTrendRadius.md,
                    background: '#2563eb',
                    color: '#fff',
                    fontSize: LeTrendTypography.fontSize.xs,
                    fontWeight: LeTrendTypography.fontWeight.semibold,
                  }}
                >
                  Oppna
                </Link>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px', maxWidth: 320 }}>
            <input
              type="text"
              placeholder="Sok titel, vibe eller bransch..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ ...inputStyle(), width: '100%' }}
            />
          </div>
          <FilterDropdown
            label="Sortering"
            value={sortMode}
            options={SORT_OPTIONS}
            onChange={(value) => setSortMode(value as SortMode)}
          />
          <FilterDropdown
            label="Budget"
            value={budgetFilter}
            options={BUDGET_OPTIONS}
            onChange={setBudgetFilter}
          />
          <FilterDropdown
            label="Kalla"
            value={sourceFilter}
            options={SOURCE_OPTIONS}
            onChange={setSourceFilter}
          />
        </div>

        <div>
          <div style={{ fontSize: LeTrendTypography.fontSize.xs, fontWeight: LeTrendTypography.fontWeight.semibold, color: LeTrendColors.textMuted, marginBottom: 8 }}>
            Bransch
          </div>
          <FilterChipRow
            options={BUSINESS_TYPE_OPTIONS}
            value={businessTypeFilter}
            onChange={setBusinessTypeFilter}
          />
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: LeTrendTypography.fontSize.xs, fontWeight: LeTrendTypography.fontWeight.semibold, color: LeTrendColors.textMuted, marginBottom: 8 }}>
              Svarighetsgrad
            </div>
            <SegmentedFilter
              options={[{ key: 'all', label: 'Alla' }, ...DIFFICULTY_OPTIONS]}
              value={difficultyFilter}
              onChange={setDifficultyFilter}
            />
          </div>

          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: LeTrendTypography.fontSize.xs, fontWeight: LeTrendTypography.fontWeight.semibold, color: LeTrendColors.textMuted, marginBottom: 8 }}>
              Inspelningstid
            </div>
            <SegmentedFilter
              options={[{ key: 'all', label: 'Alla' }, ...FILM_TIME_RANGE_OPTIONS]}
              value={filmTimeFilter}
              onChange={setFilmTimeFilter}
            />
          </div>

          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: LeTrendTypography.fontSize.xs, fontWeight: LeTrendTypography.fontWeight.semibold, color: LeTrendColors.textMuted, marginBottom: 8 }}>
              Personer
            </div>
            <SegmentedFilter
              options={[{ key: 'all', label: 'Alla' }, ...PEOPLE_RANGE_OPTIONS]}
              value={peopleFilter}
              onChange={setPeopleFilter}
            />
          </div>

          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: LeTrendTypography.fontSize.xs, fontWeight: LeTrendTypography.fontWeight.semibold, color: LeTrendColors.textMuted, marginBottom: 8 }}>
              Ateranvandning
            </div>
            <SegmentedFilter
              options={REUSE_OPTIONS}
              value={reuseFilter}
              onChange={(value) => setReuseFilter(value as ReuseFilter)}
            />
          </div>
        </div>
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
          {businessTypeFilter !== 'all' ? (
            <FilterPill
              label={BUSINESS_TYPE_OPTIONS.find((option) => option.key === businessTypeFilter)?.label ?? ''}
              onClear={() => setBusinessTypeFilter('all')}
            />
          ) : null}
          {reuseFilter !== 'all' ? (
            <FilterPill
              label={
                reuseFilter === 'unassigned'
                  ? 'Ej tilldelad'
                  : reuseFilter === 'light'
                    ? '1-3 kunder'
                    : '4+ kunder'
              }
              onClear={() => setReuseFilter('all')}
            />
          ) : null}
          {budgetFilter !== 'all' ? (
            <FilterPill
              label={BUDGET_OPTIONS.find((option) => option.key === budgetFilter)?.label ?? ''}
              onClear={() => setBudgetFilter('all')}
            />
          ) : null}
          {sourceFilter !== 'all' ? (
            <FilterPill
              label={sourceFilter === 'hagen' ? 'LeTrend' : 'CM-skapat'}
              onClear={() => setSourceFilter('all')}
            />
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
        {sortedConcepts.length} av {concepts.length}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: 14,
        }}
      >
        {sortedConcepts.map((concept) => (
          <ConceptCard
            key={concept.id}
            concept={concept}
            assignmentCount={assignmentCounts[concept.id] ?? 0}
            isAlreadyAssigned={selectedCustomerConceptIds.includes(concept.id)}
            lastUsedAt={recentAssignmentByConcept[concept.id] ?? null}
            onReview={() => router.push(`/studio/concepts/${concept.id}/review`)}
            onAssign={() => {
              setSelectedConcept(concept);
              setShowAssignModal(true);
            }}
          />
        ))}
      </div>

      {sortedConcepts.length === 0 ? (
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
            setSelectedCustomer(presetCustomerId);
            setCustomerSearch('');
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
              maxWidth: 520,
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

            <input
              type="text"
              placeholder="Sok kund..."
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              style={{ ...inputStyle(), width: '100%', marginBottom: 12 }}
            />

            <div
              style={{
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.lg,
                maxHeight: 240,
                overflowY: 'auto',
                marginBottom: 16,
              }}
            >
              {filteredCustomers.map((customer, index) => {
                const selected = selectedCustomer === customer.id;
                const count = customerConceptCounts[customer.id] ?? 0;
                const isOwned = customer.account_manager_profile_id === user?.id;

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
                        {isOwned ? ' · min kund' : ''}
                      </span>
                    <span style={{ fontSize: LeTrendTypography.fontSize.xs, color: LeTrendColors.textMuted }}>
                      {count > 0 ? `har redan ${count}` : 'inga koncept'}
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

            {selectedCustomerHasConcept ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: '8px 10px',
                  background: '#fef3c7',
                  borderRadius: LeTrendRadius.md,
                  fontSize: LeTrendTypography.fontSize.xs,
                  color: '#92400e',
                  fontWeight: LeTrendTypography.fontWeight.medium,
                }}
              >
                Det här konceptet är redan tilldelat till den valda kunden.
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedConcept(null);
                  setSelectedCustomer(presetCustomerId);
                  setCustomerSearch('');
                }}
                style={buttonStyle('secondary')}
              >
                Avbryt
              </button>
              <button
                onClick={() => {
                  void handleAssignToCustomer();
                }}
                disabled={!selectedCustomer || selectedCustomerHasConcept}
                style={{
                  ...buttonStyle('primary'),
                  opacity: selectedCustomer && !selectedCustomerHasConcept ? 1 : 0.5,
                  cursor: selectedCustomer && !selectedCustomerHasConcept ? 'pointer' : 'not-allowed',
                }}
              >
                {selectedCustomerHasConcept ? 'Redan tilldelad' : 'Tilldela'}
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
