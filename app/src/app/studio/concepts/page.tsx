'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

interface ConceptData {
  id: string;
  headline?: string;
  headline_sv?: string;
  description?: string;
  description_sv?: string;
  difficulty?: string;
  originCountry?: string;
  filmTime?: string;
  peopleNeeded?: string;
  isNew?: boolean;
  isEdited?: boolean;
}

export default function StudioConceptsPage() {
  const [concepts, setConcepts] = useState<ConceptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<{id: string; business_name: string}[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<ConceptData | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState('');

  useEffect(() => {
    loadConceptsData();
    fetchCustomers();
  }, []);

  const loadConceptsData = async () => {
    try {
      // Dynamic import to avoid SSR issues
      const module = await import('@/lib/conceptLoader');
      const loadConcepts = module.loadConcepts;
      const allConcepts = loadConcepts();
      setConcepts([...allConcepts].reverse());
    } catch (err) {
      console.error('Error loading concepts:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data } = await supabase.from('customer_profiles').select('id, business_name').order('business_name');
      setCustomers(data || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  };

  const filteredConcepts = concepts.filter(c => 
    !search || 
    (c.headline_sv || c.headline)?.toLowerCase().includes(search.toLowerCase()) ||
    (c.description_sv || c.description)?.toLowerCase().includes(search.toLowerCase())
  );

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return '#10b981';
      case 'medium': return '#f59e0b';
      case 'hard': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const handleAssignToCustomer = async () => {
    if (!selectedConcept || !selectedCustomer) return;

    try {
      const response = await fetch(
        `/api/studio-v2/customers/${selectedCustomer}/concepts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ concept_id: selectedConcept.id }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      alert(`Konceptet har lagts till på kundens lista!`);
      setShowAssignModal(false);
      setSelectedConcept(null);
      setSelectedCustomer('');
    } catch (err) {
      console.error('Error:', err);
      alert('Kunde inte lägga till konceptet');
    }
  };

  const openAssignModal = (concept: ConceptData) => {
    setSelectedConcept(concept);
    setShowAssignModal(true);
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Laddar concepts...</div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Koncept-bibliotek</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: '4px 0 0' }}>Standardiserade videokoncept att tilldela kunder</p>
        </div>
        <a 
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
        </a>
      </div>

      {/* Info Banner */}
      <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '20px' }}>💡</span>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#166534' }}>Så här fungerar det</div>
          <div style={{ fontSize: '13px', color: '#15803d' }}>Ladda upp en video → Analyseras → Lägg till på kunds konceptlista → Anpassa för kunden</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Sök koncept..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '12px 16px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
          }}
        />
      </div>

      {/* Concepts Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', 
        gap: '16px' 
      }}>
        {filteredConcepts.map((concept) => (
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
            <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px', zIndex: 10 }}>
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
                + Lägg till på kund
              </button>
              <a
                href={`/studio/concepts/${concept.id}/edit`}
                style={{
                  background: '#f3f4f6',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '12px',
                  color: '#4b5563',
                }}
              >
                Redigera
              </a>
            </div>

            {/* Header badges */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {concept.isNew && (
                  <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                    NY
                  </span>
                )}
                {concept.isEdited && (
                  <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                    UPPDATERAD
                  </span>
                )}
              </div>
              <span style={{ 
                color: getDifficultyColor(concept.difficulty || ''),
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                background: '#f3f4f6',
                padding: '2px 8px',
                borderRadius: '4px',
              }}>
                {concept.difficulty}
              </span>
            </div>

            {/* Headline */}
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a2e', marginBottom: '8px', lineHeight: 1.4, paddingRight: '100px' }}>
              {concept.headline_sv || concept.headline}
            </h3>

            {/* Description preview */}
            {concept.description_sv && (
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {concept.description_sv}
              </p>
            )}

            {/* Meta info */}
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#9ca3af', borderTop: '1px solid #f3f4f6', paddingTop: '12px', marginTop: '8px' }}>
              <span>🌍 {concept.originCountry}</span>
              <span>🎬 {concept.filmTime}</span>
              <span>👤 {concept.peopleNeeded}</span>
            </div>
          </div>
        ))}
      </div>

      {filteredConcepts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎬</div>
          <div style={{ fontSize: '16px', fontWeight: 500, color: '#6b7280' }}>Inga koncept hittades</div>
          <div style={{ fontSize: '14px', marginTop: '8px' }}>Ladda upp en video för att skapa nya koncept</div>
        </div>
      )}

      {/* Assign to Customer Modal */}
      {showAssignModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '32px', borderRadius: '16px', width: '450px', maxWidth: '90%' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 600 }}>Lägg till på kund</h3>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#6b7280' }}>
              Välj vilken kund som ska få detta koncept
            </p>
            
            <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '12px', marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Koncept:</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a2e' }}>
                {selectedConcept?.headline_sv || selectedConcept?.headline}
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: '#374151' }}>
                Välj kund
              </label>
              <select
                value={selectedCustomer}
                onChange={e => setSelectedCustomer(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '15px', background: '#fff', outline: 'none' }}
              >
                <option value="">Välj kund...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.business_name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => { setShowAssignModal(false); setSelectedConcept(null); }}
                style={{ padding: '12px 20px', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '14px' }}
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
                  fontWeight: 500
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
