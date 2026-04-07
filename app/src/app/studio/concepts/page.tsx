'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { loadConcepts } from '@/lib/conceptLoaderDB';
import type { TranslatedConcept } from '@/lib/translator';
import { supabase } from '@/lib/supabase/client';

interface PendingConcept {
  id: string;
  headline: string;
  completeness: number; // 0–3: how many of headline_sv/description_sv/whyItWorks_sv are filled
}

function getCompleteness(c: TranslatedConcept): number {
  let n = 0;
  if (c.headline_sv?.trim()) n++;
  if (c.description_sv?.trim()) n++;
  if (c.whyItWorks_sv?.trim()) n++;
  return n;
}

function AssignmentTag({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>
        Ej tilldelad
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: '#065f46', background: '#d1fae5', padding: '2px 6px', borderRadius: 4 }}>
      {count === 1 ? '1 kund' : `${count} kunder`}
    </span>
  );
}

function CompletenessTag({ n }: { n: number }) {
  const configs: Record<number, { label: string; color: string; bg: string }> = {
    3: { label: '3/3', color: '#065f46', bg: '#d1fae5' },
    2: { label: '2/3', color: '#92400e', bg: '#fef3c7' },
    1: { label: '1/3', color: '#9a3412', bg: '#ffedd5' },
    0: { label: '0/3', color: '#6b7280', bg: '#f3f4f6' },
  };
  const c = configs[n] ?? configs[0];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: c.color,
        background: c.bg,
        padding: '2px 6px',
        borderRadius: 4,
      }}
    >
      {c.label}
    </span>
  );
}

export default function StudioConceptsPage() {
  const router = useRouter();
  const [concepts, setConcepts] = useState<TranslatedConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [peopleFilter, setPeopleFilter] = useState<string>('all');
  const [filmTimeFilter, setFilmTimeFilter] = useState<string>('all');
  const [curationCustomer, setCurationCustomer] = useState<string>('');
  const [assignedConceptIds, setAssignedConceptIds] = useState<Set<string>>(new Set());
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});
  const [customerConceptCounts, setCustomerConceptCounts] = useState<Record<string, number>>({});
  const [pendingConcepts, setPendingConcepts] = useState<PendingConcept[]>([]);
  const [customers, setCustomers] = useState<{ id: string; business_name: string }[]>([]);
  const [sortByCompleteness, setSortByCompleteness] = useState(false);
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<TranslatedConcept | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customerPreview, setCustomerPreview] = useState<'loading' | { headline: string }[] | null>(null);

  useEffect(() => {
    void loadConceptsData();
    void fetchPendingConcepts();
    void fetchCustomers();
    void fetchAssignmentCounts();
  }, []);

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
        if (!data) { setCustomerPreview([]); return; }
        setCustomerPreview(
          data.map((row) => {
            const ov = ((row.concepts as { overrides?: Record<string, unknown> } | null)?.overrides ?? {}) as Record<string, unknown>;
            const headline = typeof ov.headline_sv === 'string' && ov.headline_sv.trim()
              ? ov.headline_sv.trim()
              : '(Inget namn)';
            return { headline };
          }),
        );
      } catch {
        setCustomerPreview([]);
      }
    })();
  }, [selectedCustomer]);

  useEffect(() => {
    if (!curationCustomer) {
      setAssignedConceptIds(new Set());
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from('customer_concepts')
        .select('concept_id')
        .eq('customer_profile_id', curationCustomer);
      setAssignedConceptIds(new Set((data ?? []).map((r) => r.concept_id as string)));
    })();
  }, [curationCustomer]);

  const loadConceptsData = async () => {
    try {
      const allConcepts = await loadConcepts();
      setConcepts(allConcepts);
    } catch (err) {
      console.error('Error loading concepts:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingConcepts = async () => {
    try {
      const { data } = await supabase
        .from('concepts')
        .select('id, overrides, created_at')
        .eq('is_active', false)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) {
        setPendingConcepts(
          data.map((row) => {
            const ov = (row.overrides as Record<string, unknown>) ?? {};
            const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
            const completeness = [str(ov.headline_sv), str(ov.description_sv), str(ov.whyItWorks_sv)]
              .filter(Boolean).length;
            return {
              id: row.id as string,
              headline: str(ov.headline_sv) || '(Inget namn)',
              completeness,
            };
          }),
        );
      }
    } catch (err) {
      console.error('Error loading pending concepts:', err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data } = await supabase
        .from('customer_profiles')
        .select('id, business_name')
        .order('business_name');
      setCustomers(data || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  };

  const fetchAssignmentCounts = async () => {
    try {
      const { data } = await supabase
        .from('customer_concepts')
        .select('concept_id, customer_profile_id');
      if (!data) return;
      const counts: Record<string, number> = {};
      const custCounts: Record<string, number> = {};
      for (const row of data) {
        const cid = row.concept_id as string;
        counts[cid] = (counts[cid] ?? 0) + 1;
        const pid = row.customer_profile_id as string;
        custCounts[pid] = (custCounts[pid] ?? 0) + 1;
      }
      setAssignmentCounts(counts);
      setCustomerConceptCounts(custCounts);
    } catch (err) {
      console.error('Error fetching assignment counts:', err);
    }
  };

  const filteredConcepts = concepts
    .filter((c) => {
    const matchesSearch =
      !search ||
      (c.headline_sv || c.headline)?.toLowerCase().includes(search.toLowerCase()) ||
      c.description_sv?.toLowerCase().includes(search.toLowerCase()) ||
      c.vibeAlignments.some((v) => v.toLowerCase().includes(search.toLowerCase()));
    const matchesDifficulty = difficultyFilter === 'all' || c.difficulty === difficultyFilter;
    const matchesPeople = peopleFilter === 'all' || c.peopleNeeded === peopleFilter;
    const matchesFilmTime = filmTimeFilter === 'all' || c.filmTime === filmTimeFilter;
    const matchesNotAssigned = !curationCustomer || !assignedConceptIds.has(c.id);
    const matchesUnassignedFilter = !filterUnassigned || (assignmentCounts[c.id] ?? 0) === 0;
      return matchesSearch && matchesDifficulty && matchesPeople && matchesFilmTime && matchesNotAssigned && matchesUnassignedFilter;
    })
    .sort((a, b) => sortByCompleteness ? getCompleteness(a) - getCompleteness(b) : 0);

  const getDifficultyLabel = (difficulty: string): { label: string; color: string } => {
    switch (difficulty) {
      case 'easy':
        return { label: 'Lätt', color: '#10b981' };
      case 'medium':
        return { label: 'Medel', color: '#f59e0b' };
      case 'advanced':
        return { label: 'Avancerat', color: '#ef4444' };
      default:
        return { label: difficulty, color: '#6b7280' };
    }
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json().catch(() => ({}));
      const assignedId = typeof data?.concept?.id === 'string' ? data.concept.id : null;
      setShowAssignModal(false);
      setSelectedConcept(null);
      setSelectedCustomer('');
      const justAddedParam = assignedId ? `&justAdded=${assignedId}` : '';
      router.push(`/studio/customers/${selectedCustomer}?section=koncept${justAddedParam}`);
    } catch (err) {
      console.error('Error:', err);
      alert(err instanceof Error ? err.message : 'Kunde inte lägga till konceptet');
    }
  };

  const openAssignModal = (concept: TranslatedConcept) => {
    setSelectedConcept(concept);
    setShowAssignModal(true);
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
        Laddar koncept...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '24px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
            Koncept-bibliotek
          </h1>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: '4px 0 0' }}>
            Biblioteket hämtas från databasen. Klicka &quot;Granska&quot; för att bearbeta ett koncept.
          </p>
        </div>
        <Link
          href="/studio/upload"
          style={{
            background: '#4f46e5',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '14px',
          }}
        >
          + Ladda upp ny video
        </Link>
      </div>

      {/* Search + filters */}
      <div style={{ marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Sök koncept..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 240px',
            maxWidth: '400px',
            padding: '12px 16px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <select
          value={curationCustomer}
          onChange={(e) => setCurationCustomer(e.target.value)}
          style={{
            padding: '12px 14px',
            border: curationCustomer ? '1px solid #6366f1' : '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            background: curationCustomer ? '#eef2ff' : '#fff',
            color: curationCustomer ? '#4338ca' : '#6b7280',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="">Inte hos kund: alla</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              Inte hos: {c.business_name}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['all', 'easy', 'medium', 'advanced'] as const).map((key) => {
            const label = key === 'all' ? 'Alla' : getDifficultyLabel(key).label;
            const active = difficultyFilter === key;
            const color = key === 'all' ? '#4f46e5' : getDifficultyLabel(key).color;
            return (
              <button
                key={key}
                onClick={() => setDifficultyFilter(key)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '999px',
                  border: active ? 'none' : '1px solid #e5e7eb',
                  background: active ? color : '#fff',
                  color: active ? '#fff' : '#6b7280',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {([
            { key: 'all', label: 'Alla' },
            { key: 'solo', label: 'En person' },
            { key: 'duo', label: 'Duo' },
            { key: 'small_team', label: 'Litet team' },
            { key: 'team', label: 'Större team' },
          ] as const).map(({ key, label }) => {
            const active = peopleFilter === key;
            return (
              <button
                key={key}
                onClick={() => setPeopleFilter(key)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '999px',
                  border: active ? 'none' : '1px solid #e5e7eb',
                  background: active ? '#0891b2' : '#fff',
                  color: active ? '#fff' : '#6b7280',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {([
            { key: 'all', label: 'Alla' },
            { key: '5min', label: '5 min' },
            { key: '10min', label: '10 min' },
            { key: '15min', label: '15 min' },
            { key: '20min', label: '20 min' },
            { key: '30min', label: '30 min' },
            { key: '1hr', label: '1 timme' },
            { key: '1hr_plus', label: '1+ timme' },
          ] as const).map(({ key, label }) => {
            const active = filmTimeFilter === key;
            return (
              <button
                key={key}
                onClick={() => setFilmTimeFilter(key)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '999px',
                  border: active ? 'none' : '1px solid #e5e7eb',
                  background: active ? '#d97706' : '#fff',
                  color: active ? '#fff' : '#6b7280',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setSortByCompleteness((v) => !v)}
          style={{
            padding: '8px 14px',
            borderRadius: '999px',
            border: sortByCompleteness ? 'none' : '1px solid #e5e7eb',
            background: sortByCompleteness ? '#4f46e5' : '#fff',
            color: sortByCompleteness ? '#fff' : '#6b7280',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Saknar granskning ↑
        </button>
        <button
          onClick={() => setFilterUnassigned((v) => !v)}
          style={{
            padding: '8px 14px',
            borderRadius: '999px',
            border: filterUnassigned ? 'none' : '1px solid #e5e7eb',
            background: filterUnassigned ? '#0891b2' : '#fff',
            color: filterUnassigned ? '#fff' : '#6b7280',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Ej tilldelad
        </button>
      </div>

      {/* Pending review strip */}
      {pendingConcepts.length > 0 && (
        <div
          style={{
            marginBottom: '24px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '10px',
            padding: '14px 18px',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#92400e',
              marginBottom: '10px',
            }}
          >
            Inväntar granskning ({pendingConcepts.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pendingConcepts.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <span style={{ fontSize: '13px', color: '#78350f', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.headline}
                </span>
                <CompletenessTag n={p.completeness} />
                <Link
                  href={`/studio/concepts/${p.id}/review`}
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#d97706',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Granska →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Concepts Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '16px',
        }}
      >
        {filteredConcepts.map((concept) => {
          const diff = getDifficultyLabel(concept.difficulty);
          return (
            <div
              key={concept.id}
              style={{
                background: '#fff',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                position: 'relative',
              }}
            >
              {/* Actions */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  display: 'flex',
                  gap: '6px',
                  zIndex: 10,
                }}
              >
                <button
                  onClick={() => openAssignModal(concept)}
                  style={{
                    background: '#4f46e5',
                    color: '#fff',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  + Tilldela kund
                </button>
                <Link
                  href={`/studio/concepts/${concept.id}/review`}
                  style={{
                    background: '#f3f4f6',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontSize: '12px',
                    color: '#4b5563',
                    fontWeight: 500,
                  }}
                >
                  Granska
                </Link>
              </div>

              {/* Header badges */}
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  flexWrap: 'wrap',
                  marginBottom: '12px',
                }}
              >
                {concept.isNew && (
                  <span
                    style={{
                      background: '#dbeafe',
                      color: '#1d4ed8',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    NY
                  </span>
                )}
                <span
                  style={{
                    color: diff.color,
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    background: '#f3f4f6',
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  {diff.label}
                </span>
                <span
                  style={{
                    color: '#6b7280',
                    fontSize: '12px',
                    background: '#f3f4f6',
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  {({ SE: '🇸🇪 Sverige', US: '🇺🇸 USA', UK: '🇬🇧 UK' } as Record<string, string>)[concept.market] ?? concept.market}
                </span>
              </div>

              {/* Headline */}
              <h3
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#1a1a2e',
                  marginBottom: '8px',
                  lineHeight: 1.4,
                  paddingRight: '130px',
                }}
              >
                {concept.headline_sv || concept.headline}
              </h3>

              {/* Description preview */}
              {concept.description_sv && (
                <p
                  style={{
                    fontSize: '13px',
                    color: '#6b7280',
                    marginBottom: '12px',
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {concept.description_sv}
                </p>
              )}

              {/* Meta */}
              <div
                style={{
                  display: 'flex',
                  gap: '14px',
                  fontSize: '12px',
                  color: '#9ca3af',
                  borderTop: '1px solid #f3f4f6',
                  paddingTop: '12px',
                  marginTop: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <span>🎬 {concept.filmTime}</span>
                <span>👤 {({ solo: 'En person', duo: 'Duo', small_team: 'Litet team', team: 'Större team' } as Record<string, string>)[concept.peopleNeeded] ?? concept.peopleNeeded}</span>
                {concept.vibeAlignments.length > 0 && (
                  <span>🏷️ {concept.vibeAlignments.slice(0, 2).join(', ')}</span>
                )}
                <CompletenessTag n={getCompleteness(concept)} />
                <span style={{ marginLeft: 'auto' }}>
                  <AssignmentTag count={assignmentCounts[concept.id] ?? 0} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredConcepts.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎬</div>
          <div style={{ fontSize: '16px', fontWeight: 500, color: '#6b7280' }}>
            Inga koncept hittades
          </div>
          <div style={{ fontSize: '14px', marginTop: '8px' }}>
            Ladda upp en video för att skapa nya koncept
          </div>
        </div>
      )}

      {/* Assign to Customer Modal */}
      {showAssignModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: '32px',
              borderRadius: '16px',
              width: '450px',
              maxWidth: '90%',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 600 }}>
              Tilldela till kund
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#6b7280' }}>
              Välj vilken kund som ska få detta koncept
            </p>

            <div
              style={{
                background: '#f9fafb',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '20px',
              }}
            >
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
                Koncept:
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a2e' }}>
                {selectedConcept?.headline_sv || selectedConcept?.headline}
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  marginBottom: '8px',
                  color: '#374151',
                }}
              >
                Välj kund
              </div>
              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  maxHeight: '240px',
                  overflowY: 'auto',
                }}
              >
                {customers.map((c, i) => {
                  const count = customerConceptCounts[c.id] ?? 0;
                  const isSelected = selectedCustomer === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCustomer(c.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        cursor: 'pointer',
                        background: isSelected ? '#eef2ff' : '#fff',
                        borderTop: i > 0 ? '1px solid #f3f4f6' : 'none',
                        borderRadius: i === 0 ? '8px 8px 0 0' : i === customers.length - 1 ? '0 0 8px 8px' : 0,
                      }}
                    >
                      <span style={{ fontSize: '14px', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#4338ca' : '#1a1a2e' }}>
                        {c.business_name}
                      </span>
                      <span style={{ fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                        {count === 0 ? 'Inga koncept' : count === 1 ? '1 koncept' : `${count} koncept`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedCustomer && (
              <div
                style={{
                  marginBottom: '20px',
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Senaste koncept
                  </span>
                  <Link
                    href={`/studio/customers/${selectedCustomer}?section=koncept`}
                    target="_blank"
                    style={{ fontSize: '12px', color: '#4f46e5', textDecoration: 'none', fontWeight: 500 }}
                  >
                    Se alla →
                  </Link>
                </div>
                {customerPreview === 'loading' ? (
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>Hämtar...</div>
                ) : customerPreview && customerPreview.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {customerPreview.map((p, i) => (
                      <div key={i} style={{ fontSize: '13px', color: '#374151', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                        <span style={{ color: '#d1d5db', flexShrink: 0 }}>·</span>
                        <span>{p.headline}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>Inga koncept tilldelade ännu</div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedConcept(null);
                  setSelectedCustomer('');
                }}
                style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Avbryt
              </button>
              <button
                onClick={handleAssignToCustomer}
                disabled={!selectedCustomer}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: selectedCustomer ? '#4f46e5' : '#9ca3af',
                  color: '#fff',
                  cursor: selectedCustomer ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Lägg till
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
